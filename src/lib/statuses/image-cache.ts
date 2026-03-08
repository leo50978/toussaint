import type { PrivateStatusRecord } from "@/lib/statuses";
import { recordPerfMetric } from "@/lib/utils/perf-diagnostics";

const STATUS_IMAGE_CACHE_DB = "vichly-status-image-cache";
const STATUS_IMAGE_CACHE_STORE = "images";
const STATUS_IMAGE_CACHE_VERSION = 1;
const STATUS_IMAGE_CACHE_STORAGE_KEY = "vichly_cached_status_images_v2";
const MAX_CACHED_STATUS_IMAGE_COUNT = 12;

type CachedStatusImageEntry = {
  statusId: string;
  storageUrl: string;
  expiresAt: string;
  dataUrl: string;
  cachedAt: string;
};

type CachedStatusImageStore = Record<string, CachedStatusImageEntry>;

type CacheableStatus = Pick<
  PrivateStatusRecord,
  "id" | "type" | "storageUrl" | "expiresAt"
>;

let statusImageCacheDbPromise: Promise<IDBDatabase | null> | null = null;

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openStatusImageCacheDb() {
  if (!canUseIndexedDb()) {
    return Promise.resolve<IDBDatabase | null>(null);
  }

  if (statusImageCacheDbPromise) {
    return statusImageCacheDbPromise;
  }

  statusImageCacheDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(
        STATUS_IMAGE_CACHE_DB,
        STATUS_IMAGE_CACHE_VERSION,
      );

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(STATUS_IMAGE_CACHE_STORE)) {
          database.createObjectStore(STATUS_IMAGE_CACHE_STORE, {
            keyPath: "statusId",
          });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return statusImageCacheDbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => Promise<T>,
) {
  return openStatusImageCacheDb().then(async (database) => {
    if (!database) {
      return null;
    }

    try {
      const transaction = database.transaction(STATUS_IMAGE_CACHE_STORE, mode);
      const store = transaction.objectStore(STATUS_IMAGE_CACHE_STORE);
      return await executor(store);
    } catch {
      return null;
    }
  });
}

function readLegacyStatusImageCache(): CachedStatusImageStore {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(STATUS_IMAGE_CACHE_STORAGE_KEY);
    const parsedValue = rawValue ? (JSON.parse(rawValue) as unknown) : {};

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {};
    }

    const now = Date.now();

    return Object.entries(parsedValue as Record<string, unknown>).reduce<
      CachedStatusImageStore
    >((cache, [statusId, entry]) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return cache;
      }

      const candidate = entry as Partial<CachedStatusImageEntry>;

      if (
        typeof candidate.statusId !== "string" ||
        typeof candidate.storageUrl !== "string" ||
        typeof candidate.expiresAt !== "string" ||
        typeof candidate.dataUrl !== "string" ||
        typeof candidate.cachedAt !== "string"
      ) {
        return cache;
      }

      const expiresAtMs = Date.parse(candidate.expiresAt);

      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
        return cache;
      }

      cache[statusId] = candidate as CachedStatusImageEntry;
      return cache;
    }, {});
  } catch {
    return {};
  }
}

function writeLegacyStatusImageCache(cache: CachedStatusImageStore) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const trimmedEntries = Object.values(cache)
      .sort((left, right) => right.cachedAt.localeCompare(left.cachedAt))
      .slice(0, MAX_CACHED_STATUS_IMAGE_COUNT);

    const nextCache = trimmedEntries.reduce<CachedStatusImageStore>((result, entry) => {
      result[entry.statusId] = entry;
      return result;
    }, {});

    window.localStorage.setItem(
      STATUS_IMAGE_CACHE_STORAGE_KEY,
      JSON.stringify(nextCache),
    );
  } catch {
    // Ignore storage failures.
  }
}

function clearLegacyStatusImageCache() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STATUS_IMAGE_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listIndexedDbEntries() {
  const result = await withStore("readonly", async (store) => {
    const entries = await requestToPromise(
      store.getAll() as IDBRequest<CachedStatusImageEntry[]>,
    );
    return Array.isArray(entries) ? entries : [];
  });

  return result || [];
}

async function migrateLegacyStatusImageCacheToIndexedDbInternal() {
  const legacyCache = readLegacyStatusImageCache();
  const legacyEntries = Object.values(legacyCache)
    .sort((left, right) => right.cachedAt.localeCompare(left.cachedAt))
    .slice(0, MAX_CACHED_STATUS_IMAGE_COUNT);

  if (!legacyEntries.length || !canUseIndexedDb()) {
    return;
  }

  const database = await openStatusImageCacheDb();

  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(STATUS_IMAGE_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(STATUS_IMAGE_CACHE_STORE);

    legacyEntries.forEach((entry) => {
      store.put(entry);
    });

    const didComplete = await new Promise<boolean>((resolve) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    });

    if (!didComplete) {
      recordPerfMetric("status-image-cache.migrate:skip", {
        reason: "transaction-failed",
      });
      return;
    }

    clearLegacyStatusImageCache();
    recordPerfMetric("status-image-cache.migrate:ok", {
      entries: legacyEntries.length,
    });
  } catch {
    recordPerfMetric("status-image-cache.migrate:skip", {
      reason: "exception",
    });
  }
}

async function pruneIndexedDbEntries(activeStatuses?: CacheableStatus[]) {
  await withStore("readwrite", async (store) => {
    const allEntries =
      (await requestToPromise(
        store.getAll() as IDBRequest<CachedStatusImageEntry[]>,
      )) || [];
    const now = Date.now();
    const activeImageStatuses = activeStatuses
      ? new Map(
          activeStatuses
            .filter((status) => status.type === "image")
            .map((status) => [status.id, status]),
        )
      : null;
    const sortedEntries = [...allEntries].sort((left, right) =>
      right.cachedAt.localeCompare(left.cachedAt),
    );
    const keysToDelete = new Set<string>();

    sortedEntries.forEach((entry, index) => {
      const matchingStatus = activeImageStatuses?.get(entry.statusId);
      const expiresAtMs = Date.parse(entry.expiresAt);

      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
        keysToDelete.add(entry.statusId);
        return;
      }

      if (
        activeImageStatuses &&
        (!matchingStatus ||
          matchingStatus.storageUrl !== entry.storageUrl ||
          matchingStatus.expiresAt !== entry.expiresAt)
      ) {
        keysToDelete.add(entry.statusId);
        return;
      }

      if (index >= MAX_CACHED_STATUS_IMAGE_COUNT) {
        keysToDelete.add(entry.statusId);
      }
    });

    await Promise.all(
      [...keysToDelete].map(
        (statusId) =>
          new Promise<void>((resolve) => {
            const request = store.delete(statusId);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
          }),
      ),
    );

    return null;
  });
}

export async function readCachedStatusImage(
  status: Pick<PrivateStatusRecord, "id" | "storageUrl" | "expiresAt">,
) {
  if (!canUseIndexedDb()) {
    const cache = readLegacyStatusImageCache();
    const entry = cache[status.id];

    if (!entry) {
      recordPerfMetric("status-image-cache.read:miss", {
        backend: "localStorage",
      });
      return null;
    }

    if (entry.storageUrl !== status.storageUrl || entry.expiresAt !== status.expiresAt) {
      delete cache[status.id];
      writeLegacyStatusImageCache(cache);
      recordPerfMetric("status-image-cache.read:miss", {
        backend: "localStorage",
        reason: "mismatch",
      });
      return null;
    }

    recordPerfMetric("status-image-cache.read:hit", {
      backend: "localStorage",
    });
    return entry.dataUrl;
  }

  const entry = await withStore("readonly", async (store) => {
    const result = await requestToPromise(
      store.get(status.id) as IDBRequest<CachedStatusImageEntry | undefined>,
    );
    return result || null;
  });

  if (!entry) {
    recordPerfMetric("status-image-cache.read:miss", {
      backend: "indexeddb",
    });
    return null;
  }

  if (entry.storageUrl !== status.storageUrl || entry.expiresAt !== status.expiresAt) {
    await withStore("readwrite", async (store) => {
      store.delete(status.id);
      return null;
    });
    recordPerfMetric("status-image-cache.read:miss", {
      backend: "indexeddb",
      reason: "mismatch",
    });
    return null;
  }

  recordPerfMetric("status-image-cache.read:hit", {
    backend: "indexeddb",
  });
  return entry.dataUrl;
}

export async function cacheStatusImage(
  status: Pick<PrivateStatusRecord, "id" | "storageUrl" | "expiresAt">,
  dataUrl: string,
) {
  const entry: CachedStatusImageEntry = {
    statusId: status.id,
    storageUrl: status.storageUrl,
    expiresAt: status.expiresAt,
    dataUrl,
    cachedAt: new Date().toISOString(),
  };

  if (!canUseIndexedDb()) {
    const cache = readLegacyStatusImageCache();
    cache[status.id] = entry;
    writeLegacyStatusImageCache(cache);
    recordPerfMetric("status-image-cache.write:ok", {
      backend: "localStorage",
    });
    return;
  }

  await withStore("readwrite", async (store) => {
    store.put(entry);
    return null;
  });
  await pruneIndexedDbEntries();
  recordPerfMetric("status-image-cache.write:ok", {
    backend: "indexeddb",
  });
}

export async function pruneStatusImageCache(statuses: CacheableStatus[]) {
  if (!canUseIndexedDb()) {
    const activeImageStatuses = new Map(
      statuses
        .filter((status) => status.type === "image")
        .map((status) => [status.id, status]),
    );
    const cache = readLegacyStatusImageCache();
    let hasChanged = false;

    Object.entries(cache).forEach(([statusId, entry]) => {
      const matchingStatus = activeImageStatuses.get(statusId);

      if (
        !matchingStatus ||
        matchingStatus.storageUrl !== entry.storageUrl ||
        matchingStatus.expiresAt !== entry.expiresAt
      ) {
        delete cache[statusId];
        hasChanged = true;
      }
    });

    if (hasChanged) {
      writeLegacyStatusImageCache(cache);
    }

    return;
  }

  await pruneIndexedDbEntries(statuses);
}

export async function readCachedStatusImages(
  statuses: Array<Pick<PrivateStatusRecord, "id" | "type" | "storageUrl" | "expiresAt">>,
) {
  if (!canUseIndexedDb()) {
    const cache = readLegacyStatusImageCache();
    const result = statuses.reduce<Record<string, string>>((currentResult, status) => {
      if (status.type !== "image") {
        return currentResult;
      }

      const entry = cache[status.id];

      if (!entry) {
        return currentResult;
      }

      if (entry.storageUrl !== status.storageUrl || entry.expiresAt !== status.expiresAt) {
        delete cache[status.id];
        writeLegacyStatusImageCache(cache);
        return currentResult;
      }

      currentResult[status.id] = entry.dataUrl;
      return currentResult;
    }, {});
    recordPerfMetric("status-image-cache.batch-read", {
      backend: "localStorage",
      statuses: statuses.length,
      hits: Object.keys(result).length,
    });
    return result;
  }

  const entries = await listIndexedDbEntries();
  const byId = new Map(entries.map((entry) => [entry.statusId, entry]));
  const result = statuses.reduce<Record<string, string>>((currentResult, status) => {
    if (status.type !== "image") {
      return currentResult;
    }

    const entry = byId.get(status.id);

    if (!entry) {
      return currentResult;
    }

    if (entry.storageUrl !== status.storageUrl || entry.expiresAt !== status.expiresAt) {
      return currentResult;
    }

    currentResult[status.id] = entry.dataUrl;
    return currentResult;
  }, {});
  recordPerfMetric("status-image-cache.batch-read", {
    backend: "indexeddb",
    statuses: statuses.length,
    hits: Object.keys(result).length,
  });
  return result;
}

export async function migrateLegacyStatusImageCacheToIndexedDb() {
  if (!canUseIndexedDb()) {
    return;
  }

  await migrateLegacyStatusImageCacheToIndexedDbInternal();
  await pruneIndexedDbEntries();
}

export function clearLegacyStatusImageCacheIfIndexedDbAvailable() {
  if (!canUseIndexedDb()) {
    return;
  }

  clearLegacyStatusImageCache();
}
