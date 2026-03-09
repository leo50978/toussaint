import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import type {
  ChatConversationRecord,
  ChatConversationSummary,
  ChatMessageRecord,
  ConversationAiSettings,
  ConversationManualAiTask,
} from "@/lib/chat/types";
import { buildConversationAiSummaryFromMessages } from "@/lib/chat/ai-context";
import { ChatStorageUnavailableError } from "@/lib/chat/errors";
import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";

const CHAT_STATE_DIR = join(process.cwd(), "data");
const CHAT_STATE_FILE = join(CHAT_STATE_DIR, "chat-persistence.json");
const CONVERSATIONS_COLLECTION = "conversations";
const MESSAGES_SUBCOLLECTION = "messages";
const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";
const DEFAULT_AI_TONE = "professionnel, rassurant, concis";
const DEFAULT_SCHEDULE_START = "08:00";
const DEFAULT_SCHEDULE_END = "20:00";
let legacyChatMigrationTask: Promise<void> | null = null;

type PersistedConversationRecord = ChatConversationRecord & {
  recoveryKey: string;
};

type PersistedStateFile = {
  version: 1;
  updatedAt: string;
  conversations: PersistedConversationRecord[];
};

type ConversationAccessSeed = {
  ownerId: string;
  conversationId: string;
  clientName: string;
  clientKeyHash: string;
  recoveryKey: string;
  createdAt?: string;
};

type ConversationPatchInput = {
  ownerId: string;
  conversationId: string;
  aiMode?: ChatConversationRecord["aiMode"];
  aiSettings?: ConversationAiSettings;
  status?: ChatConversationRecord["status"];
  unreadOwnerCount?: number;
  unreadClientCount?: number;
  autoReplyPending?: boolean;
  lastAutoReplyToMessageId?: string | null;
  manualAiTasks?: ConversationManualAiTask[];
  recoveryKey?: string;
};

type AppendMessageInput = {
  ownerId: string;
  conversationId: string;
  clientName?: string;
  clientKeyHash?: string;
  sender: ChatMessageRecord["sender"];
  message: ChatMessageRecord;
};

function getNowIso() {
  return new Date().toISOString();
}

function getDefaultScheduleTimezone() {
  return "UTC";
}

function normalizeAiSettings(input: unknown): ConversationAiSettings {
  const candidate = input && typeof input === "object" ? input : {};
  const nextCandidate = candidate as Partial<ConversationAiSettings>;
  const maxLength =
    typeof nextCandidate.maxLength === "number" && Number.isFinite(nextCandidate.maxLength)
      ? Math.min(Math.max(Math.round(nextCandidate.maxLength), 80), 600)
      : 320;

  return {
    tone:
      typeof nextCandidate.tone === "string" && nextCandidate.tone.trim()
        ? nextCandidate.tone.trim().slice(0, 160)
        : DEFAULT_AI_TONE,
    personalContext:
      typeof nextCandidate.personalContext === "string"
        ? nextCandidate.personalContext.trim().slice(0, 1_500)
        : "",
    maxLength,
    blacklistWords: Array.isArray(nextCandidate.blacklistWords)
      ? [...new Set(
          nextCandidate.blacklistWords
            .filter((word): word is string => typeof word === "string")
            .map((word) => word.trim().toLowerCase())
            .filter(Boolean),
        )].slice(0, 20)
      : [],
    scheduleEnabled: Boolean(nextCandidate.scheduleEnabled),
    scheduleStart:
      typeof nextCandidate.scheduleStart === "string" && /^\d{2}:\d{2}$/.test(nextCandidate.scheduleStart)
        ? nextCandidate.scheduleStart
        : DEFAULT_SCHEDULE_START,
    scheduleEnd:
      typeof nextCandidate.scheduleEnd === "string" && /^\d{2}:\d{2}$/.test(nextCandidate.scheduleEnd)
        ? nextCandidate.scheduleEnd
        : DEFAULT_SCHEDULE_END,
    scheduleTimezone:
      typeof nextCandidate.scheduleTimezone === "string" && nextCandidate.scheduleTimezone.trim()
        ? nextCandidate.scheduleTimezone.trim().slice(0, 80)
        : getDefaultScheduleTimezone(),
  };
}

function normalizeManualAiTask(input: unknown): ConversationManualAiTask | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<ConversationManualAiTask>;
  const messageKind =
    candidate.messageKind === "text" ||
    candidate.messageKind === "voice" ||
    candidate.messageKind === "image" ||
    candidate.messageKind === "video" ||
    candidate.messageKind === "file"
      ? candidate.messageKind
      : null;
  const reason =
    candidate.reason === "media" || candidate.reason === "keyword"
      ? candidate.reason
      : null;
  const status =
    candidate.status === "pending" || candidate.status === "resolved"
      ? candidate.status
      : "pending";

  if (
    !messageKind ||
    !reason ||
    typeof candidate.id !== "string" ||
    typeof candidate.messageId !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id.trim().slice(0, 120),
    messageId: candidate.messageId.trim().slice(0, 120),
    messageKind,
    reason,
    keyword:
      typeof candidate.keyword === "string"
        ? candidate.keyword.trim().toLowerCase().slice(0, 80)
        : "",
    ownerGuidance:
      typeof candidate.ownerGuidance === "string"
        ? candidate.ownerGuidance.trim().slice(0, 2_000)
        : "",
    status,
    createdAt: candidate.createdAt,
    resolvedAt:
      typeof candidate.resolvedAt === "string" && candidate.resolvedAt
        ? candidate.resolvedAt
        : null,
  };
}

function normalizeManualAiTasks(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as ConversationManualAiTask[];
  }

  return input
    .map((task) => normalizeManualAiTask(task))
    .filter((task): task is ConversationManualAiTask => Boolean(task))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function countPendingManualAiTasks(tasks: ConversationManualAiTask[]) {
  return tasks.reduce(
    (total, task) => (task.status === "pending" ? total + 1 : total),
    0,
  );
}

function normalizeMessage(input: unknown): ChatMessageRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<ChatMessageRecord>;
  const sender =
    candidate.sender === "client" || candidate.sender === "owner" || candidate.sender === "ai"
      ? candidate.sender
      : null;
  const kind =
    candidate.kind === "text" ||
    candidate.kind === "voice" ||
    candidate.kind === "image" ||
    candidate.kind === "video" ||
    candidate.kind === "file"
      ? candidate.kind
      : null;
  const deliveryStatus =
    candidate.deliveryStatus === "queued" ||
    candidate.deliveryStatus === "sent" ||
    candidate.deliveryStatus === "delivered" ||
    candidate.deliveryStatus === "read" ||
    candidate.deliveryStatus === "failed"
      ? candidate.deliveryStatus
      : "delivered";

  if (
    !sender ||
    !kind ||
    typeof candidate.id !== "string" ||
    typeof candidate.content !== "string" ||
    typeof candidate.timestamp !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id.trim(),
    sender,
    kind,
    content: candidate.content.trim().slice(0, 2_000),
    storageUrl: typeof candidate.storageUrl === "string" ? candidate.storageUrl.trim() : "",
    mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType.trim().slice(0, 160) : "",
    fileName: typeof candidate.fileName === "string" ? candidate.fileName.trim().slice(0, 160) : "",
    fileSize:
      typeof candidate.fileSize === "number" && Number.isFinite(candidate.fileSize)
        ? Math.max(0, Math.round(candidate.fileSize))
        : 0,
    durationMs:
      typeof candidate.durationMs === "number" && Number.isFinite(candidate.durationMs)
        ? Math.max(0, Math.round(candidate.durationMs))
        : null,
    transcript:
      typeof candidate.transcript === "string" ? candidate.transcript.trim().slice(0, 3_000) : "",
    timestamp: candidate.timestamp,
    deliveryStatus,
  };
}

function applyConversationAiSummary(
  conversation: PersistedConversationRecord,
  updatedAt: string,
): PersistedConversationRecord {
  const aiConversationSummary = buildConversationAiSummaryFromMessages(
    conversation.messages,
  );

  return {
    ...conversation,
    aiConversationSummary,
    aiConversationSummaryUpdatedAt: aiConversationSummary ? updatedAt : null,
  };
}

function createConversationFromSeed(seed: ConversationAccessSeed): PersistedConversationRecord {
  const now = seed.createdAt?.trim() || getNowIso();

  return {
    id: seed.conversationId.trim(),
    ownerId: seed.ownerId.trim() || DEFAULT_OWNER_ID,
    clientName: seed.clientName.trim().slice(0, 80) || "Client",
    clientKeyHash: seed.clientKeyHash.trim(),
    aiMode: "off",
    createdAt: now,
    updatedAt: now,
    status: "active",
    messages: [],
    unreadClientCount: 0,
    unreadOwnerCount: 0,
    pendingManualTaskCount: 0,
    aiSettings: normalizeAiSettings(undefined),
    autoReplyPending: false,
    lastAutoReplyToMessageId: null,
    manualAiTasks: [],
    recoveryKey: seed.recoveryKey.trim(),
    aiConversationSummary: "",
    aiConversationSummaryUpdatedAt: null,
  };
}

function normalizeConversation(input: unknown): PersistedConversationRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<PersistedConversationRecord>;
  const aiMode =
    candidate.aiMode === "auto" || candidate.aiMode === "suggestion" || candidate.aiMode === "off"
      ? candidate.aiMode
      : "off";
  const status =
    candidate.status === "active" || candidate.status === "archived" || candidate.status === "blocked"
      ? candidate.status
      : "active";

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.ownerId !== "string" ||
    typeof candidate.clientName !== "string" ||
    typeof candidate.clientKeyHash !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id.trim(),
    ownerId: candidate.ownerId.trim(),
    clientName: candidate.clientName.trim().slice(0, 80),
    clientKeyHash: candidate.clientKeyHash.trim(),
    aiMode,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    status,
    messages: Array.isArray(candidate.messages)
      ? candidate.messages
          .map((message) => normalizeMessage(message))
          .filter((message): message is ChatMessageRecord => Boolean(message))
          .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      : [],
    unreadClientCount:
      typeof candidate.unreadClientCount === "number" && Number.isFinite(candidate.unreadClientCount)
        ? Math.max(0, Math.round(candidate.unreadClientCount))
        : 0,
    unreadOwnerCount:
      typeof candidate.unreadOwnerCount === "number" && Number.isFinite(candidate.unreadOwnerCount)
        ? Math.max(0, Math.round(candidate.unreadOwnerCount))
        : 0,
    pendingManualTaskCount:
      typeof candidate.pendingManualTaskCount === "number" &&
      Number.isFinite(candidate.pendingManualTaskCount)
        ? Math.max(0, Math.round(candidate.pendingManualTaskCount))
        : countPendingManualAiTasks(normalizeManualAiTasks(candidate.manualAiTasks)),
    aiSettings: normalizeAiSettings(candidate.aiSettings),
    autoReplyPending: Boolean(candidate.autoReplyPending),
    lastAutoReplyToMessageId:
      typeof candidate.lastAutoReplyToMessageId === "string"
        ? candidate.lastAutoReplyToMessageId
        : null,
    manualAiTasks: normalizeManualAiTasks(candidate.manualAiTasks),
    recoveryKey: typeof candidate.recoveryKey === "string" ? candidate.recoveryKey.trim().slice(0, 220) : "",
    aiConversationSummary:
      typeof candidate.aiConversationSummary === "string"
        ? candidate.aiConversationSummary.trim().slice(0, 1_400)
        : "",
    aiConversationSummaryUpdatedAt:
      typeof candidate.aiConversationSummaryUpdatedAt === "string" &&
      candidate.aiConversationSummaryUpdatedAt
        ? candidate.aiConversationSummaryUpdatedAt
        : null,
  };
}

function normalizeStateFile(input: unknown): PersistedStateFile {
  if (!input || typeof input !== "object") {
    return {
      version: 1,
      updatedAt: getNowIso(),
      conversations: [],
    };
  }

  const candidate = input as Partial<PersistedStateFile>;

  return {
    version: 1,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : getNowIso(),
    conversations: Array.isArray(candidate.conversations)
      ? candidate.conversations
          .map((conversation) => normalizeConversation(conversation))
          .filter((conversation): conversation is PersistedConversationRecord => Boolean(conversation))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      : [],
  };
}

type FirestoreLikeDb = {
  collection: (path: string) => {
    doc: (id: string) => {
      id: string;
      get: () => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
      delete: () => Promise<void>;
      collection: (path: string) => {
        doc: (id: string) => {
          set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
          delete: () => Promise<void>;
        };
        get: () => Promise<{
          docs: Array<{
            id: string;
            data: () => Record<string, unknown> | undefined;
          }>;
        }>;
      };
    };
    where: (fieldPath: string, opStr: "==", value: string) => {
      get: () => Promise<{
        docs: Array<{
          id: string;
          data: () => Record<string, unknown> | undefined;
          ref: {
            collection: (path: string) => {
              get: () => Promise<{
                docs: Array<{
                  id: string;
                  data: () => Record<string, unknown> | undefined;
                }>;
              }>;
            };
          };
        }>;
      }>;
    };
  };
};

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

async function readLegacyStateFileIfExists() {
  try {
    await fs.access(CHAT_STATE_FILE);
  } catch {
    return null;
  }

  try {
    const rawValue = await fs.readFile(CHAT_STATE_FILE, "utf8");
    return normalizeStateFile(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

async function migrateLegacyStateToFirestore(db: FirestoreLikeDb) {
  const legacyState = await readLegacyStateFileIfExists();

  if (!legacyState?.conversations.length) {
    return;
  }

  await Promise.all(
    legacyState.conversations.map((conversation) =>
      writeConversationToFirestore(db, conversation),
    ),
  );
}

async function requireChatFirestoreDb() {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    throw new ChatStorageUnavailableError();
  }

  if (!legacyChatMigrationTask) {
    legacyChatMigrationTask = migrateLegacyStateToFirestore(firestoreDb).catch((error) => {
      legacyChatMigrationTask = null;
      throw error;
    });
  }

  await legacyChatMigrationTask;

  return firestoreDb;
}

function buildConversationMetadata(conversation: PersistedConversationRecord) {
  const lastMessage = conversation.messages.at(-1);
  const previewSource =
    lastMessage?.content.trim() ||
    (lastMessage?.kind === "voice" ? lastMessage.transcript.trim() : "");

  return {
    ownerId: conversation.ownerId,
    clientName: conversation.clientName,
    clientKeyHash: conversation.clientKeyHash,
    aiMode: conversation.aiMode,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    status: conversation.status,
    unreadClientCount: conversation.unreadClientCount,
    unreadOwnerCount: conversation.unreadOwnerCount,
    aiSettings: conversation.aiSettings,
    autoReplyPending: Boolean(conversation.autoReplyPending),
    lastAutoReplyToMessageId: conversation.lastAutoReplyToMessageId || null,
    manualAiTasks: normalizeManualAiTasks(conversation.manualAiTasks),
    pendingManualTaskCount: countPendingManualAiTasks(
      normalizeManualAiTasks(conversation.manualAiTasks),
    ),
    aiConversationSummary: conversation.aiConversationSummary || "",
    aiConversationSummaryUpdatedAt:
      conversation.aiConversationSummaryUpdatedAt || null,
    recoveryKey: conversation.recoveryKey,
    messageCount: conversation.messages.length,
    lastMessagePreview: previewSource
      ? previewSource.slice(0, 220)
      : lastMessage
        ? lastMessage.kind === "voice"
          ? "Message vocal"
          : lastMessage.kind === "image"
            ? "Image"
            : lastMessage.kind === "video"
              ? "Video"
              : lastMessage.kind === "file"
                ? lastMessage.fileName || "Fichier"
                : "Message"
        : "Aucun message",
    lastMessageSender: lastMessage?.sender || null,
  };
}

function buildMessagePayload(message: ChatMessageRecord) {
  return {
    sender: message.sender,
    kind: message.kind,
    content: message.content,
    storageUrl: message.storageUrl,
    mimeType: message.mimeType,
    fileName: message.fileName,
    fileSize: message.fileSize,
    durationMs: message.durationMs,
    transcript: message.transcript,
    timestamp: message.timestamp,
    deliveryStatus: message.deliveryStatus,
  };
}

async function readConversationFromFirestore(
  db: FirestoreLikeDb,
  conversationId: string,
): Promise<PersistedConversationRecord | null> {
  const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
  const snapshot = await conversationRef.get();

  if (!snapshot.exists) {
    return null;
  }

  const rawConversation = snapshot.data() || {};
  const messageSnapshot = await conversationRef.collection(MESSAGES_SUBCOLLECTION).get();
  const messages = messageSnapshot.docs
    .map((doc) =>
      normalizeMessage({
        id: doc.id,
        ...(doc.data() || {}),
      }),
    )
    .filter((message): message is ChatMessageRecord => Boolean(message))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  return normalizeConversation({
    id: conversationId,
    ...rawConversation,
    messages,
  });
}

async function writeConversationToFirestore(
  db: FirestoreLikeDb,
  conversation: PersistedConversationRecord,
) {
  const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversation.id);
  await conversationRef.set(buildConversationMetadata(conversation), {
    merge: true,
  });

  await Promise.all(
    conversation.messages.map((message) =>
      conversationRef
        .collection(MESSAGES_SUBCOLLECTION)
        .doc(message.id)
        .set(buildMessagePayload(message), {
          merge: true,
        }),
    ),
  );
}

async function deleteConversationFromFirestore(
  db: FirestoreLikeDb,
  conversation: PersistedConversationRecord,
) {
  const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversation.id);

  await Promise.all(
    conversation.messages.map((message) =>
      conversationRef.collection(MESSAGES_SUBCOLLECTION).doc(message.id).delete(),
    ),
  );

  await conversationRef.delete();
}

async function listOwnerConversationsFromFirestore(db: FirestoreLikeDb, ownerId: string) {
  const querySnapshot = await db
    .collection(CONVERSATIONS_COLLECTION)
    .where("ownerId", "==", ownerId)
    .get();

  const conversations = await Promise.all(
    querySnapshot.docs.map(async (doc) => {
      const rawConversation = doc.data() || {};
      const messageSnapshot = await doc.ref.collection(MESSAGES_SUBCOLLECTION).get();
      const messages = messageSnapshot.docs
        .map((messageDoc) =>
          normalizeMessage({
            id: messageDoc.id,
            ...(messageDoc.data() || {}),
          }),
        )
        .filter((message): message is ChatMessageRecord => Boolean(message))
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

      return normalizeConversation({
        id: doc.id,
        ...rawConversation,
        messages,
      });
    }),
  );

  return conversations
    .filter((conversation): conversation is PersistedConversationRecord => Boolean(conversation))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeConversationSummary(
  input: unknown,
): ChatConversationSummary | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<ChatConversationSummary>;
  const aiMode =
    candidate.aiMode === "auto" || candidate.aiMode === "suggestion" || candidate.aiMode === "off"
      ? candidate.aiMode
      : null;
  const status =
    candidate.status === "active" || candidate.status === "archived" || candidate.status === "blocked"
      ? candidate.status
      : null;
  const lastMessageSender =
    candidate.lastMessageSender === "client" ||
    candidate.lastMessageSender === "owner" ||
    candidate.lastMessageSender === "ai"
      ? candidate.lastMessageSender
      : null;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.ownerId !== "string" ||
    typeof candidate.clientName !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !aiMode ||
    !status
  ) {
    return null;
  }

  return {
    id: candidate.id.trim(),
    ownerId: candidate.ownerId.trim(),
    clientName: candidate.clientName.trim().slice(0, 80) || "Client",
    aiMode,
    status,
    updatedAt: candidate.updatedAt,
    createdAt: candidate.createdAt,
    unreadClientCount:
      typeof candidate.unreadClientCount === "number" && Number.isFinite(candidate.unreadClientCount)
        ? Math.max(0, Math.round(candidate.unreadClientCount))
        : 0,
    unreadOwnerCount:
      typeof candidate.unreadOwnerCount === "number" && Number.isFinite(candidate.unreadOwnerCount)
        ? Math.max(0, Math.round(candidate.unreadOwnerCount))
        : 0,
    messageCount:
      typeof candidate.messageCount === "number" && Number.isFinite(candidate.messageCount)
        ? Math.max(0, Math.round(candidate.messageCount))
        : 0,
    lastMessagePreview:
      typeof candidate.lastMessagePreview === "string"
        ? candidate.lastMessagePreview.trim().slice(0, 220)
        : "Aucun message",
    lastMessageSender,
    pendingManualTaskCount:
      typeof candidate.pendingManualTaskCount === "number" &&
      Number.isFinite(candidate.pendingManualTaskCount)
        ? Math.max(0, Math.round(candidate.pendingManualTaskCount))
        : 0,
    recoveryKey:
      typeof candidate.recoveryKey === "string"
        ? candidate.recoveryKey.trim().slice(0, 220)
        : "",
  };
}

async function listOwnerConversationSummariesFromFirestore(
  db: FirestoreLikeDb,
  ownerId: string,
) {
  const querySnapshot = await db
    .collection(CONVERSATIONS_COLLECTION)
    .where("ownerId", "==", ownerId)
    .get();

  return querySnapshot.docs
    .map((doc) =>
      normalizeConversationSummary({
        id: doc.id,
        ...(doc.data() || {}),
      }),
    )
    .filter((summary): summary is ChatConversationSummary => Boolean(summary))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function ensureConversationAccessSeed(seed: ConversationAccessSeed) {
  const normalizedSeed = createConversationFromSeed(seed);
  const firestoreDb = await requireChatFirestoreDb();
  const existingConversation = await readConversationFromFirestore(
    firestoreDb,
    normalizedSeed.id,
  );
  const nextConversation: PersistedConversationRecord = existingConversation
    ? {
        ...existingConversation,
        ownerId: normalizedSeed.ownerId,
        clientName: normalizedSeed.clientName,
        clientKeyHash: normalizedSeed.clientKeyHash,
        recoveryKey: normalizedSeed.recoveryKey || existingConversation.recoveryKey,
        updatedAt: getNowIso(),
      }
    : normalizedSeed;
  const summarizedConversation = applyConversationAiSummary(
    nextConversation,
    nextConversation.updatedAt,
  );

  await writeConversationToFirestore(firestoreDb, summarizedConversation);

  return summarizedConversation;
}

export async function appendConversationMessage(input: AppendMessageInput) {
  const ownerId = input.ownerId.trim() || DEFAULT_OWNER_ID;
  const conversationId = input.conversationId.trim();
  const nextMessage = normalizeMessage(input.message);

  if (!conversationId || !nextMessage) {
    return null;
  }

  const firestoreDb = await requireChatFirestoreDb();
  const existingConversation =
    (await readConversationFromFirestore(firestoreDb, conversationId)) ||
    createConversationFromSeed({
      ownerId,
      conversationId,
      clientName: input.clientName || "Client",
      clientKeyHash: input.clientKeyHash || "",
      recoveryKey: "",
    });
  const nextConversation = applyConversationAiSummary({
    ...existingConversation,
    ownerId,
    clientName: input.clientName?.trim() || existingConversation.clientName,
    clientKeyHash: input.clientKeyHash?.trim() || existingConversation.clientKeyHash,
    updatedAt: nextMessage.timestamp,
    unreadOwnerCount:
      nextMessage.sender === "client"
        ? existingConversation.unreadOwnerCount + 1
        : existingConversation.unreadOwnerCount,
    unreadClientCount:
      nextMessage.sender === "owner" || nextMessage.sender === "ai"
        ? existingConversation.unreadClientCount + 1
        : existingConversation.unreadClientCount,
    messages: [
      ...existingConversation.messages.filter((message) => message.id !== nextMessage.id),
      nextMessage,
    ].sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
  }, nextMessage.timestamp);
  await writeConversationToFirestore(firestoreDb, nextConversation);
  return nextConversation;
}

export async function patchConversation(input: ConversationPatchInput) {
  const ownerId = input.ownerId.trim() || DEFAULT_OWNER_ID;
  const conversationId = input.conversationId.trim();

  if (!conversationId) {
    return null;
  }

  const firestoreDb = await requireChatFirestoreDb();
  const existingConversation =
    (await readConversationFromFirestore(firestoreDb, conversationId)) ||
    createConversationFromSeed({
      ownerId,
      conversationId,
      clientName: "Client",
      clientKeyHash: "",
      recoveryKey: "",
    });
  const now = getNowIso();
  const nextConversation: PersistedConversationRecord = {
    ...existingConversation,
    ownerId,
    aiMode: input.aiMode || existingConversation.aiMode,
    status: input.status || existingConversation.status,
    aiSettings: input.aiSettings
      ? normalizeAiSettings(input.aiSettings)
      : existingConversation.aiSettings,
    unreadOwnerCount:
      typeof input.unreadOwnerCount === "number" && Number.isFinite(input.unreadOwnerCount)
        ? Math.max(0, Math.round(input.unreadOwnerCount))
        : existingConversation.unreadOwnerCount,
    unreadClientCount:
      typeof input.unreadClientCount === "number" && Number.isFinite(input.unreadClientCount)
        ? Math.max(0, Math.round(input.unreadClientCount))
        : existingConversation.unreadClientCount,
    autoReplyPending:
      typeof input.autoReplyPending === "boolean"
        ? input.autoReplyPending
        : Boolean(existingConversation.autoReplyPending),
    lastAutoReplyToMessageId:
      typeof input.lastAutoReplyToMessageId === "string"
        ? input.lastAutoReplyToMessageId
        : input.lastAutoReplyToMessageId === null
          ? null
          : existingConversation.lastAutoReplyToMessageId || null,
    manualAiTasks: Array.isArray(input.manualAiTasks)
      ? normalizeManualAiTasks(input.manualAiTasks)
      : existingConversation.manualAiTasks,
    pendingManualTaskCount: Array.isArray(input.manualAiTasks)
      ? countPendingManualAiTasks(normalizeManualAiTasks(input.manualAiTasks))
      : existingConversation.pendingManualTaskCount,
    recoveryKey:
      typeof input.recoveryKey === "string" && input.recoveryKey.trim()
        ? input.recoveryKey.trim()
        : existingConversation.recoveryKey,
    updatedAt: now,
    aiConversationSummary: existingConversation.aiConversationSummary || "",
    aiConversationSummaryUpdatedAt:
      existingConversation.aiConversationSummaryUpdatedAt || null,
  };
  await writeConversationToFirestore(firestoreDb, nextConversation);
  return nextConversation;
}

export async function deleteConversationMessage(
  ownerId: string,
  conversationId: string,
  messageId: string,
) {
  const normalizedOwnerId = ownerId.trim() || DEFAULT_OWNER_ID;
  const normalizedConversationId = conversationId.trim();
  const normalizedMessageId = messageId.trim();

  if (!normalizedConversationId || !normalizedMessageId) {
    return null;
  }

  const firestoreDb = await requireChatFirestoreDb();
  const existingConversation = await readConversationFromFirestore(
    firestoreDb,
    normalizedConversationId,
  );

  if (!existingConversation || existingConversation.ownerId !== normalizedOwnerId) {
    return null;
  }

  const targetMessage = existingConversation.messages.find(
    (message) => message.id === normalizedMessageId,
  );

  if (!targetMessage) {
    return null;
  }

  const remainingMessages = existingConversation.messages.filter(
    (message) => message.id !== normalizedMessageId,
  );
  const lastRemainingMessage = remainingMessages.at(-1);
  const nextConversation = applyConversationAiSummary({
    ...existingConversation,
    messages: remainingMessages,
    updatedAt: lastRemainingMessage?.timestamp || existingConversation.createdAt,
    unreadOwnerCount:
      targetMessage.sender === "client"
        ? Math.max(0, existingConversation.unreadOwnerCount - 1)
        : existingConversation.unreadOwnerCount,
    unreadClientCount:
      targetMessage.sender === "owner" || targetMessage.sender === "ai"
        ? Math.max(0, existingConversation.unreadClientCount - 1)
        : existingConversation.unreadClientCount,
    autoReplyPending:
      existingConversation.lastAutoReplyToMessageId === normalizedMessageId
        ? false
        : existingConversation.autoReplyPending,
    lastAutoReplyToMessageId:
      existingConversation.lastAutoReplyToMessageId === normalizedMessageId
        ? null
        : existingConversation.lastAutoReplyToMessageId,
    manualAiTasks: existingConversation.manualAiTasks.filter(
      (task) => task.messageId !== normalizedMessageId,
    ),
    pendingManualTaskCount: countPendingManualAiTasks(
      existingConversation.manualAiTasks.filter(
        (task) => task.messageId !== normalizedMessageId,
      ),
    ),
  }, lastRemainingMessage?.timestamp || existingConversation.createdAt);
  const conversationRef = firestoreDb
    .collection(CONVERSATIONS_COLLECTION)
    .doc(normalizedConversationId);

  await conversationRef.collection(MESSAGES_SUBCOLLECTION).doc(normalizedMessageId).delete();
  await conversationRef.set(buildConversationMetadata(nextConversation), {
    merge: true,
  });

  return nextConversation;
}

export async function deleteConversation(ownerId: string, conversationId: string) {
  const normalizedOwnerId = ownerId.trim() || DEFAULT_OWNER_ID;
  const normalizedConversationId = conversationId.trim();

  if (!normalizedConversationId) {
    return false;
  }

  const firestoreDb = await requireChatFirestoreDb();
  const existingConversation = await readConversationFromFirestore(
    firestoreDb,
    normalizedConversationId,
  );

  if (!existingConversation || existingConversation.ownerId !== normalizedOwnerId) {
    return false;
  }

  await deleteConversationFromFirestore(firestoreDb, existingConversation);
  return true;
}

export async function listOwnerConversationState(ownerId: string) {
  const normalizedOwnerId = ownerId.trim() || DEFAULT_OWNER_ID;
  const firestoreDb = await requireChatFirestoreDb();
  const conversations = await listOwnerConversationsFromFirestore(
    firestoreDb,
    normalizedOwnerId,
  );

  return {
    ownerId: normalizedOwnerId,
    syncedAt: getNowIso(),
    conversations,
  };
}

export async function listOwnerConversationSummaries(ownerId: string) {
  const normalizedOwnerId = ownerId.trim() || DEFAULT_OWNER_ID;
  const firestoreDb = await requireChatFirestoreDb();
  const summaries = await listOwnerConversationSummariesFromFirestore(
    firestoreDb,
    normalizedOwnerId,
  );

  return {
    ownerId: normalizedOwnerId,
    syncedAt: getNowIso(),
    summaries,
  };
}

export async function getOwnerConversationState(ownerId: string, conversationId: string) {
  const normalizedOwnerId = ownerId.trim() || DEFAULT_OWNER_ID;
  const normalizedConversationId = conversationId.trim();

  if (!normalizedConversationId) {
    return null;
  }

  const firestoreDb = await requireChatFirestoreDb();
  const conversation = await readConversationFromFirestore(
    firestoreDb,
    normalizedConversationId,
  );

  if (!conversation || conversation.ownerId !== normalizedOwnerId) {
    return null;
  }

  return conversation;
}

export async function getClientConversationState(ownerId: string, conversationId: string) {
  const normalizedOwnerId = ownerId.trim() || DEFAULT_OWNER_ID;
  const normalizedConversationId = conversationId.trim();

  if (!normalizedConversationId) {
    return null;
  }

  const firestoreDb = await requireChatFirestoreDb();
  const conversation = await readConversationFromFirestore(
    firestoreDb,
    normalizedConversationId,
  );

  if (!conversation || conversation.ownerId !== normalizedOwnerId) {
    return null;
  }

  return conversation;
}
