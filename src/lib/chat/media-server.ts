import "server-only";

import { promises as fs } from "fs";
import { extname, join } from "path";

import type { ChatMessageKind } from "@/lib/chat/types";
import { ChatStorageUnavailableError } from "@/lib/chat/errors";
import { getOpenAiRuntime } from "@/lib/config/bootstrap";
import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";
import { hashSecurityValue } from "@/lib/security/rate-limiter";
import { createId } from "@/lib/utils/create-id";

const CHAT_MEDIA_DIR = join(process.cwd(), "data", "chat-media");
const CHAT_ASSET_COLLECTION = "chatAssets";
const CHAT_MEDIA_PREFIX = "chat-media";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_VOICE_BYTES = 12 * 1024 * 1024;
const MAX_FILE_BYTES = 18 * 1024 * 1024;
const DEFAULT_AUDIO_MODEL = process.env.OPENAI_AUDIO_MODEL || "gpt-4o-mini-transcribe";
const LOCAL_CHAT_MEDIA_FALLBACK_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";

type ChatUploadFile = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type StoredChatAssetMetadata = {
  assetId: string;
  kind: ChatMessageKind;
  ownerId: string;
  conversationId: string;
  uploaderRole: "client" | "owner";
  accessKeyHash: string;
  accessKey?: string | null;
  mimeType: string;
  fileName: string;
  fileSize: number;
  storedFileName: string;
  durationMs: number | null;
  transcript: string;
  createdAt: string;
  storageBackend: "local" | "firebase";
  storagePath: string;
};

export type StoredChatAsset = {
  assetId: string;
  kind: ChatMessageKind;
  storageUrl: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  durationMs: number | null;
  transcript: string;
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
    };
  };
};

type AllowedMimeDescriptor = {
  mimeType: string;
  extensions: string[];
  kind: ChatMessageKind;
  disposition: "inline" | "attachment";
};

const IMAGE_MIME_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} satisfies Record<string, string[]>;

const VIDEO_MIME_TYPES = {
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
} satisfies Record<string, string[]>;

const AUDIO_MIME_TYPES = {
  "audio/webm": [".webm"],
  "audio/ogg": [".ogg"],
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".mp4", ".m4a"],
  "audio/x-m4a": [".m4a"],
  "audio/m4a": [".m4a"],
} satisfies Record<string, string[]>;

const FILE_MIME_TYPES = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
} satisfies Record<string, string[]>;

const FILE_EXTENSION_TO_MIME = Object.entries(FILE_MIME_TYPES).reduce<Record<string, string>>(
  (accumulator, [mimeType, extensions]) => {
    extensions.forEach((extension) => {
      accumulator[extension] = mimeType;
    });

    return accumulator;
  },
  {},
);

function getNowIso() {
  return new Date().toISOString();
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^\w.-]+/g, "_").slice(0, 120).trim();

  if (!cleaned) {
    return "piece-jointe";
  }

  return cleaned;
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "";
}

function normalizeOwnerId(value: string) {
  return value.trim().slice(0, 120);
}

function normalizeConversationId(value: string) {
  return value.trim().slice(0, 120);
}

function normalizeDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function getAssetByteLimit(kind: ChatMessageKind) {
  if (kind === "image") {
    return MAX_IMAGE_BYTES;
  }

  if (kind === "video") {
    return MAX_VIDEO_BYTES;
  }

  if (kind === "voice") {
    return MAX_VOICE_BYTES;
  }

  return MAX_FILE_BYTES;
}

function getFileExtension(fileName: string) {
  return extname(fileName).toLowerCase().slice(0, 12);
}

function createAllowedDescriptor(
  mimeType: string,
  extensions: string[],
  kind: ChatMessageKind,
  disposition: AllowedMimeDescriptor["disposition"],
) {
  return {
    mimeType,
    extensions,
    kind,
    disposition,
  } satisfies AllowedMimeDescriptor;
}

function getAllowedMimeDescriptors() {
  return [
    ...Object.entries(IMAGE_MIME_TYPES).map(([mimeType, extensions]) =>
      createAllowedDescriptor(mimeType, extensions, "image", "inline"),
    ),
    ...Object.entries(VIDEO_MIME_TYPES).map(([mimeType, extensions]) =>
      createAllowedDescriptor(mimeType, extensions, "video", "inline"),
    ),
    ...Object.entries(AUDIO_MIME_TYPES).map(([mimeType, extensions]) =>
      createAllowedDescriptor(mimeType, extensions, "voice", "inline"),
    ),
    ...Object.entries(FILE_MIME_TYPES).map(([mimeType, extensions]) =>
      createAllowedDescriptor(mimeType, extensions, "file", "attachment"),
    ),
  ];
}

const ALLOWED_MIME_DESCRIPTORS = getAllowedMimeDescriptors();

function resolveAllowedDescriptor(
  forcedKind: ChatMessageKind | undefined,
  mimeType: string,
  fileName: string,
) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const extension = getFileExtension(fileName);
  const normalizedKind =
    forcedKind === "voice" ||
    forcedKind === "image" ||
    forcedKind === "video" ||
    forcedKind === "file"
      ? forcedKind
      : undefined;
  const fallbackMimeType =
    normalizedKind === "file" && (!normalizedMimeType || normalizedMimeType === "application/octet-stream")
      ? FILE_EXTENSION_TO_MIME[extension] || normalizedMimeType
      : normalizedMimeType;
  const descriptor =
    ((!fallbackMimeType || fallbackMimeType === "application/octet-stream") &&
    extension
      ? ALLOWED_MIME_DESCRIPTORS.find(
          (candidate) =>
            candidate.extensions.includes(extension) &&
            (!normalizedKind || candidate.kind === normalizedKind),
        )
      : null) ||
    ALLOWED_MIME_DESCRIPTORS.find((candidate) => candidate.mimeType === fallbackMimeType) ||
    null;

  if (!descriptor) {
    throw new Error("Type de fichier non autorise.");
  }

  if (normalizedKind && descriptor.kind !== normalizedKind) {
    throw new Error("Le type de fichier ne correspond pas au media attendu.");
  }

  if (extension && !descriptor.extensions.includes(extension)) {
    throw new Error("Extension de fichier non autorisee pour ce media.");
  }

  return {
    descriptor,
    extension: extension || descriptor.extensions[0] || "",
  };
}

function buildStorageUrl(assetId: string, accessKey: string) {
  const searchParams = new URLSearchParams({
    k: accessKey,
  });

  return `/api/chat/uploads/${assetId}?${searchParams.toString()}`;
}

function getMetaPath(assetId: string) {
  return join(CHAT_MEDIA_DIR, `${assetId}.json`);
}

function getBinaryPath(storedFileName: string) {
  return join(CHAT_MEDIA_DIR, storedFileName);
}

function getStoragePath(ownerId: string, conversationId: string, assetId: string, extension: string) {
  return `${CHAT_MEDIA_PREFIX}/${ownerId}/${conversationId}/${assetId}${extension || ".bin"}`;
}

async function ensureChatMediaDir() {
  if (!LOCAL_CHAT_MEDIA_FALLBACK_ENABLED) {
    throw new ChatStorageUnavailableError(
      "Firebase Storage est requis pour envoyer des vocaux et des fichiers en production.",
    );
  }

  await fs.mkdir(CHAT_MEDIA_DIR, {
    recursive: true,
  });
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

function getStorageBucketClient() {
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

async function writeMetadataToFirestore(db: FirestoreLikeDb, metadata: StoredChatAssetMetadata) {
  await db.collection(CHAT_ASSET_COLLECTION).doc(metadata.assetId).set(metadata, {
    merge: true,
  });
}

async function readMetadataFromFirestore(db: FirestoreLikeDb, assetId: string) {
  const snapshot = await db.collection(CHAT_ASSET_COLLECTION).doc(assetId).get();

  if (!snapshot.exists) {
    return null;
  }

  return normalizeMeta(snapshot.data() || {});
}

async function uploadToFirebaseStorage(
  storagePath: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
) {
  const bucket = getStorageBucketClient();

  if (!bucket) {
    return false;
  }

  try {
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: mimeType,
        cacheControl: "private, no-store",
        metadata: {
          originalName: fileName,
        },
      },
    });

    return true;
  } catch {
    return false;
  }
}

async function readFromFirebaseStorage(storagePath: string) {
  const bucket = getStorageBucketClient();

  if (!bucket) {
    return null;
  }

  try {
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();

    return buffer;
  } catch {
    return null;
  }
}

async function transcribeVoiceMessage(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
) {
  const runtime = getOpenAiRuntime();

  if (!runtime.isConfigured) {
    return "";
  }

  try {
    const formData = new FormData();
    formData.append("model", DEFAULT_AUDIO_MODEL);
    const blob = new Blob([new Uint8Array(audioBuffer)], {
      type: mimeType || "audio/webm",
    });
    formData.append("file", blob, fileName || "voice-message.webm");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      return "";
    }

    const payload = (await response.json()) as {
      text?: unknown;
    };

    if (typeof payload.text !== "string") {
      return "";
    }

    return payload.text.trim().slice(0, 3_000);
  } catch {
    return "";
  }
}

function normalizeMeta(input: unknown): StoredChatAssetMetadata | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<StoredChatAssetMetadata>;

  if (
    typeof candidate.assetId !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.storedFileName !== "string" ||
    typeof candidate.mimeType !== "string" ||
    typeof candidate.fileSize !== "number" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    assetId: candidate.assetId,
    kind:
      candidate.kind === "voice" ||
      candidate.kind === "image" ||
      candidate.kind === "video" ||
      candidate.kind === "file"
        ? candidate.kind
        : "file",
    ownerId:
      typeof candidate.ownerId === "string" ? candidate.ownerId.trim().slice(0, 120) : "",
    conversationId:
      typeof candidate.conversationId === "string"
        ? candidate.conversationId.trim().slice(0, 120)
        : "",
    uploaderRole: candidate.uploaderRole === "owner" ? "owner" : "client",
    accessKeyHash:
      typeof candidate.accessKeyHash === "string"
        ? candidate.accessKeyHash.trim().slice(0, 140)
        : "",
    accessKey:
      typeof candidate.accessKey === "string" && candidate.accessKey
        ? candidate.accessKey.trim().slice(0, 140)
        : null,
    fileName: candidate.fileName.slice(0, 160),
    mimeType: normalizeMimeType(candidate.mimeType).slice(0, 160),
    fileSize: Math.max(0, Math.round(candidate.fileSize)),
    storedFileName: candidate.storedFileName.slice(0, 180),
    durationMs: normalizeDuration(candidate.durationMs),
    transcript:
      typeof candidate.transcript === "string"
        ? candidate.transcript.trim().slice(0, 3_000)
        : "",
    createdAt: candidate.createdAt,
    storageBackend: candidate.storageBackend === "firebase" ? "firebase" : "local",
    storagePath:
      typeof candidate.storagePath === "string" && candidate.storagePath
        ? candidate.storagePath.slice(0, 260)
        : candidate.storedFileName.slice(0, 180),
  };
}

function isAccessKeyAllowed(metadata: StoredChatAssetMetadata, accessKey?: string | null) {
  const normalizedAccessKey = accessKey?.trim() || "";

  if (!normalizedAccessKey) {
    return false;
  }

  if (metadata.accessKey && metadata.accessKey === normalizedAccessKey) {
    return true;
  }

  if (!metadata.accessKeyHash) {
    return false;
  }

  return metadata.accessKeyHash === hashSecurityValue(`chat-asset:${normalizedAccessKey}`);
}

export async function saveChatUpload(
  file: ChatUploadFile,
  input?: {
    kind?: ChatMessageKind;
    durationMs?: number | null;
    ownerId?: string;
    conversationId?: string;
    actor?: "client" | "owner";
  },
): Promise<StoredChatAsset> {
  const normalizedName = sanitizeFileName(file.name || "piece-jointe");
  const ownerId = normalizeOwnerId(input?.ownerId || "");
  const conversationId = normalizeConversationId(input?.conversationId || "");
  const actor = input?.actor === "owner" ? "owner" : "client";

  if (!ownerId || !conversationId) {
    throw new Error("Contexte de conversation manquant pour le media.");
  }

  const { descriptor, extension } = resolveAllowedDescriptor(
    input?.kind,
    file.type || "application/octet-stream",
    normalizedName,
  );
  const maxBytes = getAssetByteLimit(descriptor.kind);

  if (file.size > maxBytes) {
    throw new Error(`Fichier trop lourd (max ${Math.floor(maxBytes / (1024 * 1024))} MB).`);
  }

  const assetId = createId();
  const accessKey = createId();
  const accessKeyHash = hashSecurityValue(`chat-asset:${accessKey}`);
  const storedFileName = `${assetId}${extension || ".bin"}`;
  const storagePath = getStoragePath(ownerId, conversationId, assetId, extension || ".bin");
  const dataBuffer = Buffer.from(await file.arrayBuffer());
  const durationMs = normalizeDuration(input?.durationMs);
  const transcript =
    descriptor.kind === "voice"
      ? await transcribeVoiceMessage(dataBuffer, normalizedName, descriptor.mimeType)
      : "";
  const firestoreDb = getFirestoreDb();
  if (!firestoreDb && !LOCAL_CHAT_MEDIA_FALLBACK_ENABLED) {
    throw new ChatStorageUnavailableError(
      "Firebase Admin est requis pour envoyer des fichiers en production.",
    );
  }

  const uploadedToFirebase = await uploadToFirebaseStorage(
    storagePath,
    dataBuffer,
    descriptor.mimeType,
    normalizedName,
  );
  const storageBackend: StoredChatAssetMetadata["storageBackend"] = uploadedToFirebase
    ? "firebase"
    : "local";
  const resolvedStoragePath = uploadedToFirebase ? storagePath : storedFileName;

  if (!uploadedToFirebase) {
    if (!LOCAL_CHAT_MEDIA_FALLBACK_ENABLED) {
      throw new ChatStorageUnavailableError(
        "Firebase Storage est requis pour envoyer des vocaux et des fichiers en production.",
      );
    }

    await ensureChatMediaDir();
    await fs.writeFile(getBinaryPath(storedFileName), dataBuffer);
  }

  const metadata: StoredChatAssetMetadata = {
    assetId,
    kind: descriptor.kind,
    ownerId,
    conversationId,
    uploaderRole: actor,
    accessKeyHash,
    mimeType: descriptor.mimeType,
    fileName: normalizedName,
    fileSize: file.size,
    storedFileName,
    durationMs,
    transcript,
    createdAt: getNowIso(),
    storageBackend,
    storagePath: resolvedStoragePath,
  };

  if (firestoreDb) {
    await writeMetadataToFirestore(firestoreDb, metadata);
  }

  if (!firestoreDb || storageBackend === "local") {
    if (!LOCAL_CHAT_MEDIA_FALLBACK_ENABLED) {
      throw new ChatStorageUnavailableError(
        "Firebase Admin est requis pour stocker les metadonnees media en production.",
      );
    }

    await ensureChatMediaDir();
    await fs.writeFile(getMetaPath(assetId), JSON.stringify(metadata, null, 2), "utf8");
  }

  return {
    assetId,
    kind: descriptor.kind,
    storageUrl: buildStorageUrl(assetId, accessKey),
    mimeType: descriptor.mimeType,
    fileName: normalizedName,
    fileSize: file.size,
    durationMs,
    transcript,
  };
}

async function readLocalAsset(assetId: string) {
  if (!LOCAL_CHAT_MEDIA_FALLBACK_ENABLED) {
    return null;
  }

  try {
    const rawMeta = await fs.readFile(getMetaPath(assetId), "utf8");
    const metadata = normalizeMeta(JSON.parse(rawMeta));

    if (!metadata) {
      return null;
    }

    const fileBuffer = await fs.readFile(getBinaryPath(metadata.storedFileName));

    return {
      metadata,
      buffer: fileBuffer,
    };
  } catch {
    return null;
  }
}

export async function readChatUpload(assetId: string, accessKey?: string | null) {
  const normalizedAssetId = assetId.trim();

  if (!normalizedAssetId) {
    return null;
  }

  const firestoreDb = getFirestoreDb();

  if (firestoreDb) {
    const metadata = await readMetadataFromFirestore(firestoreDb, normalizedAssetId);

    if (metadata) {
      if (!isAccessKeyAllowed(metadata, accessKey)) {
        return null;
      }

      if (metadata.storageBackend === "firebase") {
        const buffer = await readFromFirebaseStorage(metadata.storagePath);

        if (buffer) {
          return {
            metadata,
            buffer,
          };
        }
      }

      const localBuffer = await readLocalAsset(normalizedAssetId);

      if (localBuffer) {
        return {
          metadata,
          buffer: localBuffer.buffer,
        };
      }

      return null;
    }
  }

  const legacyAsset = await readLocalAsset(normalizedAssetId);

  if (!legacyAsset) {
    return null;
  }

  if (!isAccessKeyAllowed(legacyAsset.metadata, accessKey)) {
    return null;
  }

  return legacyAsset;
}
