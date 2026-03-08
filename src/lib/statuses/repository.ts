import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import type { StatusType } from "@/lib/firestore/schema";
import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";
import { recordMonitoringEvent } from "@/lib/monitoring/logger";
import { createId } from "@/lib/utils/create-id";

import type { CreateStatusInput, PrivateStatusRecord, StatusStoreFile } from "./types";

const STATUSES_DATA_DIR = join(process.cwd(), "data");
const STATUSES_MEDIA_DIR = join(STATUSES_DATA_DIR, "status-media");
const STATUSES_DATA_FILE = join(STATUSES_DATA_DIR, "statuses.json");

const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const STATUS_MEDIA_PREFIX = "statuses";
const STATUS_COLLECTION = "statuses";
const STATUS_IMAGE_MIME_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;
const STATUS_VIDEO_MIME_BY_EXTENSION = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
} as const;
const STATUS_IMAGE_MIME_TYPES = new Set(Object.values(STATUS_IMAGE_MIME_BY_EXTENSION));
const STATUS_VIDEO_MIME_TYPES = new Set(Object.values(STATUS_VIDEO_MIME_BY_EXTENSION));

type StatusListResult = {
  ownerId: string;
  syncedAt: string;
  statuses: PrivateStatusRecord[];
};

type FirestoreDocSnapshot = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

type FirestoreLikeDb = {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<FirestoreDocSnapshot>;
      set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
      delete: () => Promise<void>;
    };
    where?: (fieldPath: string, opStr: "==", value: string) => {
      get: () => Promise<{
        docs: Array<{
          id: string;
          data: () => Record<string, unknown> | undefined;
        }>;
      }>;
    };
    get: () => Promise<{
      docs: Array<{
        id: string;
        data: () => Record<string, unknown> | undefined;
      }>;
    }>;
  };
};

function getNow() {
  return new Date();
}

function getNowIso() {
  return getNow().toISOString();
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "";
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");

  if (dotIndex <= 0) {
    return "";
  }

  return normalized.slice(dotIndex);
}

function resolveStatusMediaMimeType(type: StatusType, file: File) {
  const normalizedMimeType = normalizeMimeType(file.type);
  const extension = getFileExtension(file.name);
  const isGenericMimeType =
    !normalizedMimeType || normalizedMimeType === "application/octet-stream";

  if (type === "image") {
    if (STATUS_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
      return normalizedMimeType;
    }

    if (isGenericMimeType && extension in STATUS_IMAGE_MIME_BY_EXTENSION) {
      return STATUS_IMAGE_MIME_BY_EXTENSION[extension as keyof typeof STATUS_IMAGE_MIME_BY_EXTENSION];
    }

    return "";
  }

  if (type === "video") {
    if (STATUS_VIDEO_MIME_TYPES.has(normalizedMimeType)) {
      return normalizedMimeType;
    }

    if (isGenericMimeType && extension in STATUS_VIDEO_MIME_BY_EXTENSION) {
      return STATUS_VIDEO_MIME_BY_EXTENSION[extension as keyof typeof STATUS_VIDEO_MIME_BY_EXTENSION];
    }
  }

  return "";
}

function buildMediaFileName(statusId: string, originalName: string) {
  const extension = getFileExtension(originalName);

  return `${statusId}${extension}`;
}

function normalizeStatusRecord(input: Partial<PrivateStatusRecord>) {
  if (
    typeof input.id !== "string" ||
    typeof input.ownerId !== "string" ||
    typeof input.type !== "string" ||
    typeof input.content !== "string" ||
    typeof input.storageUrl !== "string" ||
    typeof input.createdAt !== "string" ||
    typeof input.expiresAt !== "string" ||
    typeof input.viewCount !== "number" ||
    typeof input.mimeType !== "string" ||
    typeof input.fileName !== "string" ||
    typeof input.fileSize !== "number" ||
    typeof input.originalName !== "string"
  ) {
    return null;
  }

  return {
    id: input.id,
    ownerId: input.ownerId,
    type: input.type as StatusType,
    content: input.content,
    storageUrl: input.storageUrl,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    viewCount: input.viewCount,
    mimeType: input.mimeType,
    fileName: input.fileName,
    fileSize: input.fileSize,
    originalName: input.originalName,
    storageBackend:
      input.storageBackend === "firebase" ? "firebase" : "local",
    storagePath:
      typeof input.storagePath === "string" && input.storagePath
        ? input.storagePath
        : input.fileName,
  } satisfies PrivateStatusRecord;
}

function normalizeStoreFile(input: unknown): StatusStoreFile {
  if (!input || typeof input !== "object") {
    return {
      version: 1,
      updatedAt: getNowIso(),
      statuses: [],
    };
  }

  const candidate = input as Partial<StatusStoreFile>;
  const statuses = Array.isArray(candidate.statuses)
    ? candidate.statuses.reduce<PrivateStatusRecord[]>((items, status) => {
        const normalizedStatus = normalizeStatusRecord(status);

        if (normalizedStatus) {
          items.push(normalizedStatus);
        }

        return items;
      }, [])
    : [];

  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : getNowIso(),
    statuses: [...statuses].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    ),
  };
}

function getFirestoreDb(): FirestoreLikeDb | null {
  if (!hasFirebaseAdminConfig()) {
    return null;
  }

  try {
    const { db } = getFirebaseAdminServices();
    const candidate = db as unknown as FirestoreLikeDb;

    if (!candidate || typeof candidate.collection !== "function") {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

async function ensureStatusStoreFile() {
  await fs.mkdir(STATUSES_DATA_DIR, {
    recursive: true,
  });

  await fs.mkdir(STATUSES_MEDIA_DIR, {
    recursive: true,
  });

  try {
    await fs.access(STATUSES_DATA_FILE);
  } catch {
    const emptyStore: StatusStoreFile = {
      version: 1,
      updatedAt: getNowIso(),
      statuses: [],
    };

    await fs.writeFile(STATUSES_DATA_FILE, JSON.stringify(emptyStore, null, 2));
  }
}

async function writeStoreFile(store: StatusStoreFile) {
  const normalizedStore = normalizeStoreFile(store);

  await ensureStatusStoreFile();
  await fs.writeFile(
    STATUSES_DATA_FILE,
    JSON.stringify(normalizedStore, null, 2),
    "utf8",
  );

  return normalizedStore;
}

async function readStoreFile() {
  await ensureStatusStoreFile();

  try {
    const raw = await fs.readFile(STATUSES_DATA_FILE, "utf8");

    return normalizeStoreFile(JSON.parse(raw));
  } catch {
    const emptyStore: StatusStoreFile = {
      version: 1,
      updatedAt: getNowIso(),
      statuses: [],
    };

    await writeStoreFile(emptyStore);

    return emptyStore;
  }
}

function getStatusStoragePath(fileName: string) {
  return `${STATUS_MEDIA_PREFIX}/${DEFAULT_OWNER_ID}/${fileName}`;
}

function getFirebaseBucketClient() {
  if (!hasFirebaseAdminConfig()) {
    return null;
  }

  try {
    const { storage } = getFirebaseAdminServices();
    const bucket = storage.bucket();

    if (!bucket || typeof bucket.file !== "function") {
      return null;
    }

    return bucket;
  } catch {
    return null;
  }
}

async function listStatusesFromFirestore() {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return [] as PrivateStatusRecord[];
  }

  const collection = firestoreDb.collection(STATUS_COLLECTION);
  const querySnapshot =
    typeof collection.where === "function"
      ? await collection.where("ownerId", "==", DEFAULT_OWNER_ID).get()
      : await collection.get();

  return querySnapshot.docs
    .map((doc) =>
      normalizeStatusRecord({
        id: doc.id,
        ...(doc.data() || {}),
      }),
    )
    .filter((status): status is PrivateStatusRecord => Boolean(status))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function getStatusFromFirestore(statusId: string) {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return null;
  }

  const snapshot = await firestoreDb.collection(STATUS_COLLECTION).doc(statusId).get();

  if (!snapshot.exists) {
    return null;
  }

  return normalizeStatusRecord({
    id: statusId,
    ...(snapshot.data() || {}),
  });
}

async function writeStatusToFirestore(status: PrivateStatusRecord) {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return false;
  }

  await firestoreDb
    .collection(STATUS_COLLECTION)
    .doc(status.id)
    .set(
      {
        ...status,
        createdAtTs: new Date(status.createdAt),
        expiresAtTs: new Date(status.expiresAt),
      },
      {
        merge: true,
      },
    );

  return true;
}

async function deleteStatusFromFirestore(statusId: string) {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return false;
  }

  await firestoreDb.collection(STATUS_COLLECTION).doc(statusId).delete();

  return true;
}

async function tryUploadStatusMediaToFirebase(
  storagePath: string,
  fileBuffer: Buffer,
  mimeType: string,
  originalName: string,
) {
  const bucket = getFirebaseBucketClient();

  if (!bucket) {
    return false;
  }

  try {
    const file = bucket.file(storagePath);

    await file.save(fileBuffer, {
      resumable: false,
      metadata: {
        contentType: mimeType || "application/octet-stream",
        cacheControl: "private, max-age=60",
        metadata: {
          originalName,
        },
      },
    });

    return true;
  } catch {
    return false;
  }
}

async function tryDeleteStatusMediaFromFirebase(storagePath: string) {
  const bucket = getFirebaseBucketClient();

  if (!bucket) {
    return false;
  }

  try {
    const file = bucket.file(storagePath);

    await file.delete({
      ignoreNotFound: true,
    });

    return true;
  } catch {
    return false;
  }
}

async function tryReadStatusMediaFromFirebase(storagePath: string) {
  const bucket = getFirebaseBucketClient();

  if (!bucket) {
    return null;
  }

  try {
    const file = bucket.file(storagePath);
    const [fileBuffer] = await file.download();

    return fileBuffer;
  } catch {
    return null;
  }
}

async function deleteStatusMediaFile(status: PrivateStatusRecord) {
  if (!status.fileName) {
    return;
  }

  if (status.storageBackend === "firebase") {
    const deletedInFirebase = await tryDeleteStatusMediaFromFirebase(
      status.storagePath || status.fileName,
    );

    if (deletedInFirebase) {
      return;
    }
  }

  const filePath = join(STATUSES_MEDIA_DIR, status.fileName);

  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be gone.
  }
}

function mergeStatuses(primary: PrivateStatusRecord[], secondary: PrivateStatusRecord[]) {
  const merged = new Map<string, PrivateStatusRecord>();

  [...primary, ...secondary].forEach((status) => {
    if (!merged.has(status.id)) {
      merged.set(status.id, status);
    }
  });

  return [...merged.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function cleanupExpiredLocalStatuses() {
  const store = await readStoreFile();
  const nowMs = Date.now();
  const activeStatuses: PrivateStatusRecord[] = [];
  const expiredStatuses: PrivateStatusRecord[] = [];

  store.statuses.forEach((status) => {
    if (new Date(status.expiresAt).getTime() <= nowMs) {
      expiredStatuses.push(status);
      return;
    }

    activeStatuses.push(status);
  });

  if (!expiredStatuses.length) {
    return {
      removedCount: 0,
      statuses: store.statuses,
      updatedAt: store.updatedAt,
    };
  }

  await Promise.all(expiredStatuses.map((status) => deleteStatusMediaFile(status)));

  const writtenStore = await writeStoreFile({
    version: 1,
    updatedAt: getNowIso(),
    statuses: activeStatuses,
  });

  return {
    removedCount: expiredStatuses.length,
    statuses: writtenStore.statuses,
    updatedAt: writtenStore.updatedAt,
  };
}

async function cleanupExpiredFirestoreStatuses() {
  const firestoreStatuses = await listStatusesFromFirestore();
  const nowMs = Date.now();
  const expiredStatuses = firestoreStatuses.filter(
    (status) => new Date(status.expiresAt).getTime() <= nowMs,
  );
  const activeStatuses = firestoreStatuses.filter(
    (status) => new Date(status.expiresAt).getTime() > nowMs,
  );

  if (!expiredStatuses.length) {
    return {
      removedCount: 0,
      statuses: firestoreStatuses,
    };
  }

  await Promise.all(
    expiredStatuses.map(async (status) => {
      await deleteStatusMediaFile(status);
      await deleteStatusFromFirestore(status.id).catch(() => undefined);
    }),
  );

  return {
    removedCount: expiredStatuses.length,
    statuses: activeStatuses,
  };
}

async function cleanupExpiredStatuses() {
  const [localResult, firestoreResult] = await Promise.all([
    cleanupExpiredLocalStatuses(),
    cleanupExpiredFirestoreStatuses(),
  ]);

  const removedCount = localResult.removedCount + firestoreResult.removedCount;
  const statuses = mergeStatuses(firestoreResult.statuses, localResult.statuses);
  const updatedAt =
    statuses.map((status) => status.createdAt).sort().at(-1) || getNowIso();

  if (removedCount) {
    try {
      await recordMonitoringEvent({
        level: "info",
        source: "status-maintenance",
        message: "Statuts expires nettoyes.",
        context: {
          removedCount,
        },
      });
    } catch {
      // Best-effort monitoring.
    }
  }

  return {
    updatedAt,
    statuses,
    removedCount,
  };
}

function normalizeStatusInput(input: CreateStatusInput) {
  const content = input.content.trim().slice(0, 700);

  return {
    type: input.type,
    content,
  };
}

async function validateMediaFile(
  type: StatusType,
  file: File | null | undefined,
) {
  if (type === "text") {
    return;
  }

  if (!file) {
    throw new Error("Un fichier media est obligatoire pour ce statut.");
  }

  const resolvedMimeType = resolveStatusMediaMimeType(type, file);

  if (type === "image" && !resolvedMimeType) {
    throw new Error("Le fichier doit etre une image JPEG, PNG ou WEBP.");
  }

  if (type === "video" && !resolvedMimeType) {
    throw new Error("Le fichier doit etre une video MP4 ou WEBM.");
  }

  const maxSize = type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  if (file.size > maxSize) {
    throw new Error(
      type === "image"
        ? "Image trop lourde (max 8 Mo)."
        : "Video trop lourde (max 32 Mo).",
    );
  }
}

function formatPublicMediaUrl(statusId: string) {
  return `/api/status-media/${statusId}`;
}

export async function listOwnerStatuses(): Promise<StatusListResult> {
  const cleaned = await cleanupExpiredStatuses();

  return {
    ownerId: DEFAULT_OWNER_ID,
    syncedAt: cleaned.updatedAt,
    statuses: cleaned.statuses.filter((status) => status.ownerId === DEFAULT_OWNER_ID),
  };
}

export async function listPublicStatuses(): Promise<StatusListResult> {
  const cleaned = await cleanupExpiredStatuses();

  return {
    ownerId: DEFAULT_OWNER_ID,
    syncedAt: cleaned.updatedAt,
    statuses: cleaned.statuses.filter((status) => status.ownerId === DEFAULT_OWNER_ID),
  };
}

export async function createOwnerStatus(input: CreateStatusInput) {
  const normalizedInput = normalizeStatusInput(input);
  await validateMediaFile(normalizedInput.type, input.file);

  if (normalizedInput.type === "text" && !normalizedInput.content) {
    throw new Error("Le statut texte ne peut pas etre vide.");
  }

  const now = getNow();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + STATUS_LIFETIME_MS).toISOString();
  const statusId = createId();

  let fileName = "";
  let mimeType = "";
  let fileSize = 0;
  let originalName = "";
  let storageBackend: PrivateStatusRecord["storageBackend"] = "local";
  let storagePath = "";

  if (input.file) {
    const resolvedMimeType = resolveStatusMediaMimeType(normalizedInput.type, input.file);

    if (!resolvedMimeType) {
      throw new Error("Type de media non autorise pour ce statut.");
    }

    fileName = buildMediaFileName(statusId, input.file.name);
    mimeType = resolvedMimeType;
    fileSize = input.file.size;
    originalName = input.file.name;
    storagePath = getStatusStoragePath(fileName);

    const fileBuffer = Buffer.from(await input.file.arrayBuffer());
    const uploadedToFirebase = await tryUploadStatusMediaToFirebase(
      storagePath,
      fileBuffer,
      mimeType,
      originalName,
    );

    if (uploadedToFirebase) {
      storageBackend = "firebase";
    } else {
      const filePath = join(STATUSES_MEDIA_DIR, fileName);

      await ensureStatusStoreFile();
      await fs.writeFile(filePath, fileBuffer);
      storagePath = fileName;
    }
  }

  const status: PrivateStatusRecord = {
    id: statusId,
    ownerId: DEFAULT_OWNER_ID,
    type: normalizedInput.type,
    content: normalizedInput.content,
    storageUrl: formatPublicMediaUrl(statusId),
    createdAt,
    expiresAt,
    viewCount: 0,
    mimeType,
    fileName,
    fileSize,
    originalName,
    storageBackend,
    storagePath,
  };

  const firestoreWritten = await writeStatusToFirestore(status);

  if (!firestoreWritten) {
    const store = await cleanupExpiredLocalStatuses();
    const nextStore = await writeStoreFile({
      version: 1,
      updatedAt: getNowIso(),
      statuses: [status, ...store.statuses],
    });

    return {
      syncedAt: nextStore.updatedAt,
      status,
    };
  }

  return {
    syncedAt: getNowIso(),
    status,
  };
}

export async function deleteOwnerStatus(statusId: string) {
  const firestoreStatus = await getStatusFromFirestore(statusId);

  if (firestoreStatus && firestoreStatus.ownerId === DEFAULT_OWNER_ID) {
    await deleteStatusMediaFile(firestoreStatus);
    await deleteStatusFromFirestore(statusId);
    return true;
  }

  const store = await readStoreFile();
  const currentStatus = store.statuses.find(
    (status) => status.id === statusId && status.ownerId === DEFAULT_OWNER_ID,
  );

  if (!currentStatus) {
    return false;
  }

  await deleteStatusMediaFile(currentStatus);

  await writeStoreFile({
    ...store,
    updatedAt: getNowIso(),
    statuses: store.statuses.filter((status) => status.id !== statusId),
  });

  return true;
}

export async function runStatusMaintenance() {
  const cleanedStore = await cleanupExpiredStatuses();

  return {
    removedCount: cleanedStore.removedCount,
    remainingCount: cleanedStore.statuses.length,
    syncedAt: cleanedStore.updatedAt,
  };
}

export async function getStatusById(statusId: string) {
  const cleaned = await cleanupExpiredStatuses();

  return (
    cleaned.statuses.find(
      (status) => status.id === statusId && status.ownerId === DEFAULT_OWNER_ID,
    ) || null
  );
}

export async function incrementStatusView(statusId: string) {
  const firestoreStatus = await getStatusFromFirestore(statusId);

  if (firestoreStatus && firestoreStatus.ownerId === DEFAULT_OWNER_ID) {
    const nextStatus: PrivateStatusRecord = {
      ...firestoreStatus,
      viewCount: firestoreStatus.viewCount + 1,
    };

    await writeStatusToFirestore(nextStatus);

    return {
      syncedAt: getNowIso(),
      status: nextStatus,
    };
  }

  const store = await readStoreFile();
  const currentStatus = store.statuses.find(
    (status) => status.id === statusId && status.ownerId === DEFAULT_OWNER_ID,
  );

  if (!currentStatus) {
    return null;
  }

  const nextStatus: PrivateStatusRecord = {
    ...currentStatus,
    viewCount: currentStatus.viewCount + 1,
  };

  const nextStore = await writeStoreFile({
    ...store,
    updatedAt: getNowIso(),
    statuses: store.statuses.map((status) =>
      status.id === statusId ? nextStatus : status,
    ),
  });

  return {
    syncedAt: nextStore.updatedAt,
    status: nextStatus,
  };
}

export async function readStatusMedia(statusId: string) {
  const status = await getStatusById(statusId);

  if (!status || !status.fileName) {
    return null;
  }

  if (status.storageBackend === "firebase") {
    const fileBuffer = await tryReadStatusMediaFromFirebase(
      status.storagePath || status.fileName,
    );

    if (fileBuffer) {
      return {
        status,
        fileBuffer,
      };
    }
  }

  const filePath = join(STATUSES_MEDIA_DIR, status.fileName);

  try {
    const fileBuffer = await fs.readFile(filePath);

    return {
      status,
      fileBuffer,
    };
  } catch {
    return null;
  }
}
