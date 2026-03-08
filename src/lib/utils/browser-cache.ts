import { recordPerfMetric } from "@/lib/utils/perf-diagnostics";

type BrowserCacheEnvelope<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
  schemaVersion: number;
};

type BrowserCacheWriteOptions = {
  maxBytes?: number;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: {
      timeout?: number;
    },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export const BROWSER_CACHE_SCHEMA_VERSION = 2;

export function createBrowserCacheKey(
  namespace: string,
  schemaVersion = BROWSER_CACHE_SCHEMA_VERSION,
) {
  return `${namespace}:v${schemaVersion}`;
}

export function readBrowserCache<T>(key: string): T | null {
  const storage = getBrowserStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(key);

    if (!rawValue) {
      recordPerfMetric("browser-cache.read:miss", {
        key,
        reason: "empty",
      });
      return null;
    }

    const parsed = JSON.parse(rawValue) as BrowserCacheEnvelope<T>;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== BROWSER_CACHE_SCHEMA_VERSION ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      storage.removeItem(key);
      recordPerfMetric("browser-cache.read:miss", {
        key,
        reason: "stale",
      });
      return null;
    }

    recordPerfMetric("browser-cache.read:hit", {
      key,
    });
    return parsed.value;
  } catch {
    recordPerfMetric("browser-cache.read:miss", {
      key,
      reason: "error",
    });
    return null;
  }
}

export function estimateBrowserCacheBytes(payload: unknown) {
  try {
    const serialized = JSON.stringify(payload);

    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(serialized).length;
    }

    return serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function writeBrowserCache<T>(
  key: string,
  value: T,
  ttlMs: number,
  options?: BrowserCacheWriteOptions,
) {
  const storage = getBrowserStorage();

  if (!storage) {
    return false;
  }

  try {
    const payload: BrowserCacheEnvelope<T> = {
      value,
      expiresAt: Date.now() + Math.max(1_000, ttlMs),
      createdAt: Date.now(),
      schemaVersion: BROWSER_CACHE_SCHEMA_VERSION,
    };
    const serialized = JSON.stringify(payload);
    const maxBytes =
      typeof options?.maxBytes === "number" && Number.isFinite(options.maxBytes)
        ? Math.max(1_024, Math.round(options.maxBytes))
        : 0;

    if (maxBytes > 0) {
      const byteLength =
        typeof TextEncoder !== "undefined"
          ? new TextEncoder().encode(serialized).length
          : serialized.length;

      if (byteLength > maxBytes) {
        storage.removeItem(key);
        recordPerfMetric("browser-cache.write:skip", {
          key,
          reason: "max-bytes",
          bytes: byteLength,
          maxBytes,
        });
        return false;
      }
    }

    storage.setItem(key, serialized);
    recordPerfMetric("browser-cache.write:ok", {
      key,
      bytes:
        typeof TextEncoder !== "undefined"
          ? new TextEncoder().encode(serialized).length
          : serialized.length,
    });
    return true;
  } catch {
    // Best-effort cache.
    recordPerfMetric("browser-cache.write:skip", {
      key,
      reason: "exception",
    });
    return false;
  }
}

export function removeBrowserCache(key: string) {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore cache removal failures.
  }
}

export function removeBrowserCacheByPrefix(prefix: string) {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    // Ignore cache removal failures.
  }
}

export function removeOutdatedBrowserCacheVersions(
  namespace: string,
  keepVersion = BROWSER_CACHE_SCHEMA_VERSION,
) {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    const activeKey = createBrowserCacheKey(namespace, keepVersion);

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (!key) {
        continue;
      }

      if (key === namespace || (key.startsWith(`${namespace}:v`) && key !== activeKey)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    // Ignore cache removal failures.
  }
}

export function runWhenBrowserIdle(task: () => void, timeout = 250) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const idleWindow = window as IdleWindow;
  let timeoutId: number | null = null;
  let idleId: number | null = null;

  const executeTask = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    task();
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    idleId = idleWindow.requestIdleCallback(executeTask, {
      timeout,
    });
  } else {
    timeoutId = window.setTimeout(executeTask, timeout);
  }

  return () => {
    if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
      idleWindow.cancelIdleCallback(idleId);
    }

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}
