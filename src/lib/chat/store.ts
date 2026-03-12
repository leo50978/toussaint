import type {
  ChatConversationRecord,
  ChatConversationSummary,
  ChatMessageDraft,
  ChatMessageRecord,
  ChatMessageReplyReference,
  ChatStore,
  ClientChatSession,
  ConversationAiSettings,
  ConversationManualAiTask,
  NormalizedChatMessageInput,
} from "@/lib/chat/types";
import { buildAiConversationContext } from "@/lib/chat/ai-context";
import { createId } from "@/lib/utils/create-id";
import { recordPerfMetric } from "@/lib/utils/perf-diagnostics";

const CHAT_STORAGE_KEY = "vichly_local_chat_store";
const CHAT_SYNC_CHANNEL = "vichly-local-chat-sync";
const CHAT_SESSION_PREFIX = "vichly_local_chat_session:";
const MAX_PREVIEW_LENGTH = 90;
const STORE_PERSIST_DEBOUNCE_MS = 300;
const CHAT_PERSIST_MAX_CONVERSATIONS = 48;
const CHAT_PERSIST_MAX_MESSAGES_PER_CONVERSATION = 60;
const CHAT_PERSIST_MAX_TOTAL_MESSAGES = 960;
const CHAT_PERSIST_MAX_BYTES = 900_000;

type MessageListener = () => void;
type AutoReplyApiResponse = {
  reply: string;
  suppressed?: boolean;
  reason?: string;
  conversation?: unknown;
};
type IssuedClientAccessPayload = {
  sessionId: string;
  ownerId: string;
  conversationId: string;
  clientName: string;
  clientKey: string;
  clientKeyHash: string;
  createdAt: string;
  validatedAt: string | null;
};
type ValidatedClientAccessPayload = {
  valid: true;
  session: {
    id: string;
    ownerId: string;
    conversationId: string;
    clientName: string;
    clientKeyHash: string;
    createdAt: string;
    updatedAt: string;
    lastValidatedAt: string | null;
  };
};
type SecuredClientAccessPayload = {
  saved: true;
  hasSecurityCode: boolean;
};
type OwnerConversationStatePayload = {
  ownerId: string;
  syncedAt: string;
  conversations: unknown[];
};
type OwnerConversationSummariesPayload = {
  ownerId: string;
  syncedAt: string;
  summaries: unknown[];
};
type OwnerConversationThreadPayload = {
  conversation?: unknown;
};
type ClientConversationStatePayload = {
  conversation?: unknown;
};
type SyncRequestOptions = {
  signal?: AbortSignal;
  forceFullSync?: boolean;
};

const DEFAULT_AI_TONE = "professionnel, rassurant, concis";
const DEFAULT_AI_MAX_LENGTH = 320;
const DEFAULT_SCHEDULE_START = "08:00";
const DEFAULT_SCHEDULE_END = "20:00";
const MAX_AI_CONTEXT_LENGTH = 1_500;
const MAX_OPTIONAL_MESSAGE_LENGTH = 500;
const CHAT_MEDIA_KINDS = new Set(["voice", "image", "video", "file"]);
let inMemoryStore: ChatStore | null = null;
let storePersistTimer: ReturnType<typeof setTimeout> | null = null;
let storeLifecycleBound = false;
let sharedChatSyncChannel: BroadcastChannel | null = null;
const ownerSyncTasks = new Map<string, Promise<unknown>>();
const ownerThreadSyncTasks = new Map<string, Promise<unknown>>();
const clientSyncTasks = new Map<string, Promise<unknown>>();

function getNowIso() {
  return new Date().toISOString();
}

function getDefaultScheduleTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

function isValidTimeValue(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(":").map((segment) => Number(segment));

  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function normalizeBlacklistWords(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map((word) => (typeof word === "string" ? word.trim().toLowerCase() : ""))
        .filter(Boolean),
    )].slice(0, 20);
  }

  return [];
}

function normalizeConversationAiSettings(
  input: Partial<ConversationAiSettings> | undefined,
): ConversationAiSettings {
  const maxLength =
    typeof input?.maxLength === "number" && Number.isFinite(input.maxLength)
      ? Math.min(Math.max(Math.round(input.maxLength), 80), 600)
      : DEFAULT_AI_MAX_LENGTH;
  const scheduleStart =
    typeof input?.scheduleStart === "string" && isValidTimeValue(input.scheduleStart)
      ? input.scheduleStart
      : DEFAULT_SCHEDULE_START;
  const scheduleEnd =
    typeof input?.scheduleEnd === "string" && isValidTimeValue(input.scheduleEnd)
      ? input.scheduleEnd
      : DEFAULT_SCHEDULE_END;

  return {
    tone:
      typeof input?.tone === "string" && input.tone
        ? input.tone.slice(0, 160)
        : DEFAULT_AI_TONE,
    personalContext:
      typeof input?.personalContext === "string"
        ? input.personalContext.trim().slice(0, MAX_AI_CONTEXT_LENGTH)
        : "",
    maxLength,
    blacklistWords: normalizeBlacklistWords(input?.blacklistWords),
    scheduleEnabled: Boolean(input?.scheduleEnabled),
    scheduleStart,
    scheduleEnd,
    scheduleTimezone:
      typeof input?.scheduleTimezone === "string" && input.scheduleTimezone.trim()
        ? input.scheduleTimezone.trim()
        : getDefaultScheduleTimezone(),
  };
}

function normalizeManualAiTasks(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as ConversationManualAiTask[];
  }

  return value
    .map((task) => {
      if (!task || typeof task !== "object") {
        return null;
      }

      const candidate = task as Partial<ConversationManualAiTask>;
      const messageKind = isChatMessageKind(candidate.messageKind)
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
      } satisfies ConversationManualAiTask;
    })
    .filter((task): task is ConversationManualAiTask => Boolean(task))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function countPendingManualAiTasks(tasks: ConversationManualAiTask[]) {
  return tasks.reduce(
    (total, task) => (task.status === "pending" ? total + 1 : total),
    0,
  );
}

function isChatMessageKind(value: unknown): value is ChatMessageRecord["kind"] {
  return (
    value === "text" ||
    value === "voice" ||
    value === "image" ||
    value === "video" ||
    value === "file"
  );
}

function isDeliveryStatus(
  value: unknown,
): value is ChatMessageRecord["deliveryStatus"] {
  return (
    value === "queued" ||
    value === "sent" ||
    value === "delivered" ||
    value === "read" ||
    value === "failed"
  );
}

function normalizeOptionalMessageContent(value: string | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\r\n/g, "\n").trim().slice(0, MAX_OPTIONAL_MESSAGE_LENGTH);
}

function normalizeReplyReference(
  input: unknown,
): ChatMessageReplyReference | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<ChatMessageReplyReference>;

  if (
    typeof candidate.messageId !== "string" ||
    typeof candidate.sender !== "string" ||
    typeof candidate.kind !== "string" ||
    typeof candidate.timestamp !== "string"
  ) {
    return null;
  }

  if (
    candidate.sender !== "client" &&
    candidate.sender !== "owner" &&
    candidate.sender !== "ai"
  ) {
    return null;
  }

  if (!isChatMessageKind(candidate.kind)) {
    return null;
  }

  return {
    messageId: candidate.messageId.trim().slice(0, 120),
    sender: candidate.sender,
    kind: candidate.kind,
    content: normalizeOptionalMessageContent(candidate.content),
    fileName:
      typeof candidate.fileName === "string"
        ? candidate.fileName.trim().slice(0, 160)
        : "",
    timestamp: candidate.timestamp,
  };
}

function getDefaultMessageLabel(message: Pick<ChatMessageRecord, "kind" | "fileName">) {
  if (message.kind === "voice") {
    return "Message vocal";
  }

  if (message.kind === "image") {
    return message.fileName || "Photo";
  }

  if (message.kind === "video") {
    return message.fileName || "Video";
  }

  if (message.kind === "file") {
    return message.fileName || "Fichier";
  }

  return "Message";
}

export function createReplyReference(
  message: Pick<
    ChatMessageRecord,
    "id" | "sender" | "kind" | "content" | "fileName" | "timestamp" | "transcript"
  >,
): ChatMessageReplyReference {
  const fallbackContent =
    message.kind === "voice"
      ? message.transcript.trim() || "Message vocal"
      : normalizeOptionalMessageContent(message.content) || getDefaultMessageLabel(message);

  return {
    messageId: message.id,
    sender: message.sender,
    kind: message.kind,
    content: fallbackContent.slice(0, 240),
    fileName: (message.fileName || "").trim().slice(0, 160),
    timestamp: message.timestamp,
  };
}

function normalizeMessageDraft(
  input: string | ChatMessageDraft,
): NormalizedChatMessageInput {
  if (typeof input === "string") {
    return {
      kind: "text",
      content: normalizeLocalMessageContent(input),
      storageUrl: "",
      mimeType: "",
      fileName: "",
      fileSize: 0,
      durationMs: null,
      transcript: "",
      deliveryStatus: "delivered",
    };
  }

  const kind = isChatMessageKind(input.kind) ? input.kind : "text";
  const content =
    kind === "text"
      ? normalizeLocalMessageContent(input.content || "")
      : normalizeOptionalMessageContent(input.content);
  const storageUrl =
    typeof input.storageUrl === "string" ? input.storageUrl.trim().slice(0, 1_500) : "";

  if (CHAT_MEDIA_KINDS.has(kind) && !storageUrl) {
    throw new Error("Le media n a pas pu etre prepare correctement.");
  }

  return {
    kind,
    content,
    storageUrl,
    mimeType:
      typeof input.mimeType === "string" ? input.mimeType.trim().slice(0, 160) : "",
    fileName:
      typeof input.fileName === "string" ? input.fileName.trim().slice(0, 160) : "",
    fileSize:
      typeof input.fileSize === "number" && Number.isFinite(input.fileSize)
        ? Math.max(0, Math.round(input.fileSize))
        : 0,
    durationMs:
      typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.round(input.durationMs))
        : null,
    transcript:
      kind === "voice" && typeof input.transcript === "string"
        ? input.transcript.trim().slice(0, 3_000)
        : "",
    deliveryStatus: isDeliveryStatus(input.deliveryStatus)
      ? input.deliveryStatus
      : "delivered",
  };
}

function normalizeStoredMessage(
  input: unknown,
): ChatMessageRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<ChatMessageRecord>;

  if (typeof candidate.sender !== "string" || typeof candidate.timestamp !== "string") {
    return null;
  }

  const kind = isChatMessageKind(candidate.kind) ? candidate.kind : "text";
  const content =
    kind === "text"
      ? typeof candidate.content === "string" && candidate.content.trim()
        ? candidate.content.trim().slice(0, 1_200)
        : "Message indisponible"
      : normalizeOptionalMessageContent(candidate.content);

  const normalized: ChatMessageRecord = {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : createId(),
    sender:
      candidate.sender === "client" || candidate.sender === "owner" || candidate.sender === "ai"
        ? candidate.sender
        : "client",
    kind,
    content,
    storageUrl:
      typeof candidate.storageUrl === "string" ? candidate.storageUrl.trim().slice(0, 1_500) : "",
    mimeType:
      typeof candidate.mimeType === "string" ? candidate.mimeType.trim().slice(0, 160) : "",
    fileName:
      typeof candidate.fileName === "string" ? candidate.fileName.trim().slice(0, 160) : "",
    fileSize:
      typeof candidate.fileSize === "number" && Number.isFinite(candidate.fileSize)
        ? Math.max(0, Math.round(candidate.fileSize))
        : 0,
    durationMs:
      typeof candidate.durationMs === "number" && Number.isFinite(candidate.durationMs)
        ? Math.max(0, Math.round(candidate.durationMs))
        : null,
    transcript:
      kind === "voice" && typeof candidate.transcript === "string"
        ? candidate.transcript.trim().slice(0, 3_000)
        : "",
    timestamp: candidate.timestamp,
    deliveryStatus: isDeliveryStatus(candidate.deliveryStatus)
      ? candidate.deliveryStatus
      : "delivered",
    replyTo: normalizeReplyReference(candidate.replyTo),
  };

  if (CHAT_MEDIA_KINDS.has(kind) && !normalized.storageUrl) {
    return null;
  }

  return normalized;
}

function createEmptyStore(): ChatStore {
  return {
    version: 1,
    updatedAt: getNowIso(),
    conversations: [],
  };
}

function normalizeStore(input: unknown): ChatStore {
  if (!input || typeof input !== "object") {
    return createEmptyStore();
  }

  const candidate = input as Partial<ChatStore>;
  const conversations = Array.isArray(candidate.conversations)
    ? candidate.conversations
        .filter((conversation): conversation is ChatConversationRecord => {
          return Boolean(
            conversation &&
              typeof conversation.id === "string" &&
              typeof conversation.ownerId === "string" &&
              typeof conversation.clientName === "string" &&
              Array.isArray(conversation.messages),
          );
        })
        .map((conversation) => {
          const now = getNowIso();
          return {
            id: conversation.id,
            ownerId: conversation.ownerId.trim().slice(0, 120),
            clientName: conversation.clientName.trim().slice(0, 80) || "Client",
            clientKeyHash:
              typeof conversation.clientKeyHash === "string"
                ? conversation.clientKeyHash.trim().slice(0, 160)
                : "",
            aiMode:
              conversation.aiMode === "auto" ||
              conversation.aiMode === "suggestion" ||
              conversation.aiMode === "off"
                ? conversation.aiMode
                : "off",
            createdAt:
              typeof conversation.createdAt === "string" ? conversation.createdAt : now,
            updatedAt:
              typeof conversation.updatedAt === "string" ? conversation.updatedAt : now,
            status:
              conversation.status === "active" ||
              conversation.status === "archived" ||
              conversation.status === "blocked"
                ? conversation.status
                : "active",
            messages: conversation.messages
              .map((message) => normalizeStoredMessage(message))
              .filter((message): message is ChatMessageRecord => Boolean(message))
              .sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
            unreadClientCount:
              typeof conversation.unreadClientCount === "number" &&
              Number.isFinite(conversation.unreadClientCount)
                ? Math.max(0, Math.round(conversation.unreadClientCount))
                : 0,
            unreadOwnerCount:
              typeof conversation.unreadOwnerCount === "number" &&
              Number.isFinite(conversation.unreadOwnerCount)
                ? Math.max(0, Math.round(conversation.unreadOwnerCount))
                : 0,
            aiConversationSummary:
              typeof conversation.aiConversationSummary === "string"
                ? conversation.aiConversationSummary.trim().slice(0, 1_400)
                : "",
            aiConversationSummaryUpdatedAt:
              typeof conversation.aiConversationSummaryUpdatedAt === "string" &&
              conversation.aiConversationSummaryUpdatedAt
                ? conversation.aiConversationSummaryUpdatedAt
                : null,
            pendingManualTaskCount:
              typeof conversation.pendingManualTaskCount === "number" &&
              Number.isFinite(conversation.pendingManualTaskCount)
                ? Math.max(0, Math.round(conversation.pendingManualTaskCount))
                : countPendingManualAiTasks(normalizeManualAiTasks(conversation.manualAiTasks)),
            messageCount:
              typeof conversation.messageCount === "number" &&
              Number.isFinite(conversation.messageCount)
                ? Math.max(0, Math.round(conversation.messageCount))
                : conversation.messages.length,
            lastMessagePreview:
              typeof conversation.lastMessagePreview === "string"
                ? conversation.lastMessagePreview.trim().slice(0, 220)
                : "",
            lastMessageSender:
              conversation.lastMessageSender === "client" ||
              conversation.lastMessageSender === "owner" ||
              conversation.lastMessageSender === "ai"
                ? conversation.lastMessageSender
                : null,
            threadHydrated:
              typeof conversation.threadHydrated === "boolean"
                ? conversation.threadHydrated
                : true,
            aiSettings: normalizeConversationAiSettings(conversation.aiSettings),
            autoReplyPending: Boolean(conversation.autoReplyPending),
            lastAutoReplyToMessageId:
              typeof conversation.lastAutoReplyToMessageId === "string"
                ? conversation.lastAutoReplyToMessageId
                : null,
            manualAiTasks: normalizeManualAiTasks(conversation.manualAiTasks),
            recoveryKey:
              typeof conversation.recoveryKey === "string"
                ? conversation.recoveryKey.trim().slice(0, 220)
                : "",
          } satisfies ChatConversationRecord;
        })
    : [];

  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : getNowIso(),
    conversations: conversations.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
  };
}

function normalizeConversationRecord(input: unknown): ChatConversationRecord | null {
  const normalizedStore = normalizeStore({
    version: 1,
    updatedAt: getNowIso(),
    conversations: [input],
  });

  return normalizedStore.conversations[0] || null;
}

function normalizeConversationSummaryRecord(
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

function loadStoreFromLocalStorage(): ChatStore {
  const browserWindow = safeWindow();

  if (!browserWindow) {
    return inMemoryStore || createEmptyStore();
  }

  const raw = browserWindow.localStorage.getItem(CHAT_STORAGE_KEY);

  if (!raw) {
    return createEmptyStore();
  }

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    return createEmptyStore();
  }
}

function estimateSerializedBytes(value: unknown) {
  try {
    const serialized = JSON.stringify(value);

    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(serialized).length;
    }

    return serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function createPersistedConversationSnapshot(
  conversation: ChatConversationRecord,
  messageLimit: number,
): ChatConversationRecord {
  const knownMessageCount =
    typeof conversation.messageCount === "number" && Number.isFinite(conversation.messageCount)
      ? Math.max(Math.round(conversation.messageCount), conversation.messages.length)
      : conversation.messages.length;
  const safeMessageLimit = Math.max(
    0,
    Math.min(
      CHAT_PERSIST_MAX_MESSAGES_PER_CONVERSATION,
      Math.max(0, Math.round(messageLimit)),
      conversation.messages.length,
    ),
  );
  const persistedMessages =
    safeMessageLimit > 0
      ? conversation.messages.slice(-safeMessageLimit)
      : [];
  const lastKnownMessage = conversation.messages.at(-1);
  const fallbackPreview = getMessagePreview(lastKnownMessage);

  return {
    ...conversation,
    messages: persistedMessages,
    messageCount: knownMessageCount,
    lastMessagePreview: conversation.lastMessagePreview?.trim() || fallbackPreview,
    lastMessageSender:
      conversation.lastMessageSender || lastKnownMessage?.sender || null,
    threadHydrated:
      knownMessageCount === 0
        ? true
        : conversation.threadHydrated !== false &&
          persistedMessages.length >= knownMessageCount,
  };
}

function createPersistedStoreSnapshot(store: ChatStore) {
  let remainingMessageBudget = CHAT_PERSIST_MAX_TOTAL_MESSAGES;
  let persistedConversations = [...store.conversations]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, CHAT_PERSIST_MAX_CONVERSATIONS)
    .map((conversation) => {
      const nextConversation = createPersistedConversationSnapshot(
        conversation,
        remainingMessageBudget,
      );
      remainingMessageBudget = Math.max(
        0,
        remainingMessageBudget - nextConversation.messages.length,
      );
      return nextConversation;
    });

  let persistedStore: ChatStore = {
    ...store,
    conversations: persistedConversations,
  };

  while (
    persistedStore.conversations.length > 1 &&
    estimateSerializedBytes(persistedStore) > CHAT_PERSIST_MAX_BYTES
  ) {
    persistedConversations = persistedConversations.slice(0, -1);
    persistedStore = {
      ...store,
      conversations: persistedConversations,
    };
  }

  return persistedStore;
}

function writeStoreToLocalStorage(store: ChatStore) {
  const browserWindow = safeWindow();

  if (!browserWindow) {
    return;
  }

  const persistedStore = createPersistedStoreSnapshot(store);
  const serializedStore = JSON.stringify(persistedStore);
  browserWindow.localStorage.setItem(CHAT_STORAGE_KEY, serializedStore);
  recordPerfMetric("chat-store.persist", {
    conversations: persistedStore.conversations.length,
    messages: persistedStore.conversations.reduce(
      (count, conversation) => count + conversation.messages.length,
      0,
    ),
    bytes:
      typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(serializedStore).length
        : serializedStore.length,
  });
}

function getSharedChatSyncChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!sharedChatSyncChannel) {
    sharedChatSyncChannel = new BroadcastChannel(CHAT_SYNC_CHANNEL);
  }

  return sharedChatSyncChannel;
}

function emitLocalChatUpdate() {
  const browserWindow = safeWindow();

  if (!browserWindow) {
    return;
  }

  browserWindow.dispatchEvent(new CustomEvent("vichly-chat-updated"));
}

function emitCrossTabChatUpdate() {
  const channel = getSharedChatSyncChannel();

  if (!channel) {
    return;
  }

  channel.postMessage({
    type: "chat-updated",
    at: getNowIso(),
  });
}

function flushStorePersistence() {
  if (storePersistTimer) {
    clearTimeout(storePersistTimer);
    storePersistTimer = null;
  }

  if (!inMemoryStore) {
    return;
  }

  writeStoreToLocalStorage(inMemoryStore);
  emitCrossTabChatUpdate();
}

function scheduleStorePersistence() {
  if (!safeWindow()) {
    return;
  }

  if (storePersistTimer) {
    clearTimeout(storePersistTimer);
  }

  storePersistTimer = setTimeout(() => {
    storePersistTimer = null;
    flushStorePersistence();
  }, STORE_PERSIST_DEBOUNCE_MS);
}

function refreshStoreFromLocalStorage() {
  inMemoryStore = loadStoreFromLocalStorage();
  return inMemoryStore;
}

function ensureStoreLifecycleHandlers() {
  const browserWindow = safeWindow();

  if (!browserWindow || storeLifecycleBound) {
    return;
  }

  const flushOnHide = () => {
    if (browserWindow.document.visibilityState === "hidden") {
      flushStorePersistence();
    }
  };

  browserWindow.addEventListener("pagehide", flushStorePersistence);
  browserWindow.document.addEventListener("visibilitychange", flushOnHide);
  storeLifecycleBound = true;
}

function readStore(): ChatStore {
  if (inMemoryStore) {
    return inMemoryStore;
  }

  ensureStoreLifecycleHandlers();
  inMemoryStore = loadStoreFromLocalStorage();

  return inMemoryStore;
}

function getSessionStorageKey(ownerId: string) {
  return `${CHAT_SESSION_PREFIX}${ownerId}`;
}

const CLIENT_ACCESS_REQUEST_TIMEOUT_MS = 15_000;

function createClientKey() {
  return `ck_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function hashClientKeyFallback(clientKey: string) {
  let hash = 0;

  for (let index = 0; index < clientKey.length; index += 1) {
    hash = (hash << 5) - hash + clientKey.charCodeAt(index);
    hash |= 0;
  }

  return `ckh_${Math.abs(hash).toString(16)}`;
}

function persistClientChatSession(session: ClientChatSession) {
  safeWindow()?.localStorage.setItem(
    getSessionStorageKey(session.ownerId),
    JSON.stringify(session),
  );
}

function buildClientSession(
  input: Partial<ClientChatSession> & {
    ownerId: string;
    clientName: string;
    clientKey: string;
    conversationId: string;
    createdAt?: string;
  },
): ClientChatSession {
  return {
    ownerId: input.ownerId,
    clientName: input.clientName.trim(),
    clientKey: input.clientKey.trim(),
    clientKeyHash:
      typeof input.clientKeyHash === "string" && input.clientKeyHash
        ? input.clientKeyHash
        : hashClientKeyFallback(input.clientKey),
    conversationId: input.conversationId,
    createdAt: input.createdAt || getNowIso(),
    serverSessionId:
      typeof input.serverSessionId === "string" ? input.serverSessionId : null,
    lastValidatedAt:
      typeof input.lastValidatedAt === "string" ? input.lastValidatedAt : null,
  };
}

function normalizeLocalMessageContent(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    throw new Error("Le message est vide.");
  }

  if (normalized.length > 1200) {
    throw new Error("Message trop long (max 1200 caracteres).");
  }

  return normalized;
}

function getMessagePreview(message: ChatMessageRecord | undefined) {
  if (!message) {
    return "Aucun message";
  }

  const normalized =
    message.content.trim() || (message.kind === "voice" ? message.transcript.trim() : "");

  if (!normalized) {
    return getDefaultMessageLabel(message);
  }

  if (normalized.length <= MAX_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}

function toConversationSummary(
  conversation: ChatConversationRecord,
): ChatConversationSummary {
  const lastMessage = conversation.messages.at(-1);
  const knownMessageCount =
    typeof conversation.messageCount === "number" && Number.isFinite(conversation.messageCount)
      ? Math.max(Math.round(conversation.messageCount), conversation.messages.length)
      : conversation.messages.length;
  const hasFreshThread =
    conversation.threadHydrated !== false && conversation.messages.length >= knownMessageCount;
  const fallbackPreview = getMessagePreview(lastMessage);

  return {
    id: conversation.id,
    ownerId: conversation.ownerId,
    clientName: conversation.clientName,
    aiMode: conversation.aiMode,
    status: conversation.status,
    updatedAt: conversation.updatedAt,
    createdAt: conversation.createdAt,
    unreadClientCount: conversation.unreadClientCount,
    unreadOwnerCount: conversation.unreadOwnerCount,
    messageCount: knownMessageCount,
    lastMessagePreview:
      hasFreshThread
        ? fallbackPreview
        : conversation.lastMessagePreview?.trim() || fallbackPreview,
    lastMessageSender:
      hasFreshThread
        ? lastMessage?.sender || conversation.lastMessageSender || null
        : conversation.lastMessageSender || lastMessage?.sender || null,
    pendingManualTaskCount:
      typeof conversation.pendingManualTaskCount === "number" &&
      Number.isFinite(conversation.pendingManualTaskCount)
        ? Math.max(0, Math.round(conversation.pendingManualTaskCount))
        : countPendingManualAiTasks(conversation.manualAiTasks),
    recoveryKey: conversation.recoveryKey || "",
  };
}

export function buildAiMessagePayload(
  messages: ChatConversationRecord["messages"],
) {
  return messages.flatMap((message) => {
    if (message.kind !== "text") {
      return [];
    }

    const content = message.content.trim();

    if (!content) {
      return [];
    }

    const replyPrefix = message.replyTo
      ? `En reponse a (${message.replyTo.sender}) : ${
          message.replyTo.content || getDefaultMessageLabel(message.replyTo)
        }\n`
      : "";

    return [
      {
        id: message.id,
        sender: message.sender,
        content: `${replyPrefix}${content}`.trim(),
        timestamp: message.timestamp,
      },
    ];
  });
}

export function buildAiConversationRequestPayload(
  conversation: Pick<ChatConversationRecord, "messages" | "aiConversationSummary">,
) {
  return buildAiConversationContext(conversation);
}

function mutateStore(mutator: (store: ChatStore) => ChatStore) {
  const currentStore = readStore();
  const nextStore = normalizeStore(mutator(currentStore));

  inMemoryStore = nextStore;
  scheduleStorePersistence();
  emitLocalChatUpdate();

  return nextStore;
}

function createConversationRecord(
  ownerId: string,
  clientName: string,
  clientKeyHash: string,
  recoveryKey?: string,
): ChatConversationRecord {
  const now = getNowIso();

  return {
    id: createId(),
    ownerId,
    clientName: clientName.trim(),
    clientKeyHash,
    aiMode: "off",
    createdAt: now,
    updatedAt: now,
    status: "active",
    messages: [],
    unreadClientCount: 0,
    unreadOwnerCount: 0,
    aiConversationSummary: "",
    aiConversationSummaryUpdatedAt: null,
    messageCount: 0,
    lastMessagePreview: "Aucun message",
    lastMessageSender: null,
    threadHydrated: true,
    aiSettings: normalizeConversationAiSettings(undefined),
    autoReplyPending: false,
    lastAutoReplyToMessageId: null,
    pendingManualTaskCount: 0,
    manualAiTasks: [],
    recoveryKey: recoveryKey?.trim().slice(0, 220) || "",
  };
}

function createConversationRecordFromSummary(
  summary: ChatConversationSummary,
): ChatConversationRecord {
  return {
    id: summary.id,
    ownerId: summary.ownerId,
    clientName: summary.clientName,
    clientKeyHash: "",
    aiMode: summary.aiMode,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    status: summary.status,
    messages: [],
    unreadClientCount: summary.unreadClientCount,
    unreadOwnerCount: summary.unreadOwnerCount,
    aiConversationSummary: "",
    aiConversationSummaryUpdatedAt: null,
    messageCount: summary.messageCount,
    lastMessagePreview: summary.lastMessagePreview,
    lastMessageSender: summary.lastMessageSender,
    threadHydrated: summary.messageCount === 0,
    aiSettings: normalizeConversationAiSettings(undefined),
    autoReplyPending: false,
    lastAutoReplyToMessageId: null,
    pendingManualTaskCount: summary.pendingManualTaskCount,
    manualAiTasks: [],
    recoveryKey: summary.recoveryKey || "",
  };
}

function createConversationRecordFromSession(session: ClientChatSession) {
  const conversation = createConversationRecord(
    session.ownerId,
    session.clientName,
    session.clientKeyHash,
    session.clientKey,
  );

  conversation.id = session.conversationId;

  return conversation;
}

function createMessage(
  sender: ChatMessageRecord["sender"],
  content: string | ChatMessageDraft,
  replyTo?: ChatMessageReplyReference | null,
): ChatMessageRecord {
  const normalized = normalizeMessageDraft(content);

  return {
    id: createId(),
    sender,
    kind: normalized.kind,
    content: normalized.content,
    storageUrl: normalized.storageUrl,
    mimeType: normalized.mimeType,
    fileName: normalized.fileName,
    fileSize: normalized.fileSize,
    durationMs: normalized.durationMs,
    transcript: normalized.transcript,
    timestamp: getNowIso(),
    deliveryStatus: normalized.deliveryStatus,
    replyTo: normalizeReplyReference(replyTo),
  };
}

function findConversationById(
  store: ChatStore,
  conversationId: string,
) {
  return store.conversations.find(
    (conversation) => conversation.id === conversationId,
  );
}

export function getClientChatSession(ownerId: string): ClientChatSession | null {
  const browserWindow = safeWindow();

  if (!browserWindow) {
    return null;
  }

  const raw = browserWindow.localStorage.getItem(getSessionStorageKey(ownerId));

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Partial<ClientChatSession>;

    if (
      typeof session.conversationId !== "string" ||
      typeof session.clientName !== "string" ||
      typeof session.clientKey !== "string"
    ) {
      return null;
    }

    return buildClientSession({
      ownerId,
      clientName: session.clientName,
      clientKey: session.clientKey,
      clientKeyHash: session.clientKeyHash,
      conversationId: session.conversationId,
      createdAt:
        typeof session.createdAt === "string" ? session.createdAt : getNowIso(),
      serverSessionId: session.serverSessionId,
      lastValidatedAt: session.lastValidatedAt,
    });
  } catch {
    return null;
  }
}

export function clearClientChatSession(ownerId: string) {
  const browserWindow = safeWindow();

  if (!browserWindow) {
    return;
  }

  browserWindow.localStorage.removeItem(getSessionStorageKey(ownerId));
  emitLocalChatUpdate();
  emitCrossTabChatUpdate();
}

async function fetchClientAccessRoute(
  payload: Record<string, unknown>,
  timeoutMs = CLIENT_ACCESS_REQUEST_TIMEOUT_MS,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    throw new Error("Connexion serveur requise pour ouvrir une discussion.");
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? browserWindow.setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    return await browserWindow.fetch("/api/chat/client-access", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Le serveur met trop de temps a repondre. Reessaie.");
    }

    throw error;
  } finally {
    if (timeoutId !== null) {
      browserWindow.clearTimeout(timeoutId);
    }
  }
}

async function requestIssuedClientAccess(
  ownerId: string,
  conversationId: string,
  clientName: string,
  previousClientKey?: string,
) {
  try {
    const response = await fetchClientAccessRoute({
      action: "issue",
      ownerId,
      conversationId,
      clientName,
      previousClientKey,
    });

    const payload = (await response.json()) as
      | IssuedClientAccessPayload
      | {
          error?: string;
        };

    if (
      !response.ok ||
      !("clientKey" in payload) ||
      typeof payload.clientKey !== "string" ||
      typeof payload.clientKeyHash !== "string"
    ) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : "Creation de cle impossible.",
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw error;
    }

    throw new Error("Creation de discussion impossible pour le moment.");
  }
}

async function requestValidatedClientAccess(
  ownerId: string,
  clientKey: string,
  securityCode?: string,
  conversationId?: string,
) {
  try {
    const response = await fetchClientAccessRoute({
      action: conversationId ? "validate" : "recover",
      ownerId,
      clientKey,
      securityCode,
      conversationId,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ValidatedClientAccessPayload;

    if (!payload.valid || !payload.session) {
      return null;
    }

    return payload.session;
  } catch {
    return null;
  }
}

async function requestSetClientSecurityCode(
  ownerId: string,
  clientKey: string,
  securityCode: string,
) {
  if (!securityCode.trim()) {
    return {
      saved: true,
      hasSecurityCode: false,
    };
  }

  try {
    const response = await fetchClientAccessRoute({
      action: "secure",
      ownerId,
      clientKey,
      securityCode,
    });

    const payload = (await response.json()) as
      | SecuredClientAccessPayload
      | {
          saved?: false;
          error?: string;
        };

    if (!response.ok || !("saved" in payload) || payload.saved !== true) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : "Configuration du code impossible.",
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw error;
    }

    throw new Error("Configuration du code impossible.");
  }
}

function upsertConversationFromSession(session: ClientChatSession) {
  mutateStore((store) => {
    const existingConversation = findConversationById(store, session.conversationId);

    if (!existingConversation) {
      return {
        ...store,
        updatedAt: getNowIso(),
        conversations: [
          createConversationRecordFromSession(session),
          ...store.conversations,
        ],
      };
    }

    return {
      ...store,
      updatedAt: getNowIso(),
      conversations: store.conversations.map((conversation) =>
        conversation.id === session.conversationId
          ? {
              ...conversation,
              clientName: session.clientName,
              clientKeyHash: session.clientKeyHash,
              recoveryKey: session.clientKey,
            }
          : conversation,
      ),
    };
  });
}

function upsertConversationFromServer(conversationInput: unknown) {
  const conversation = normalizeConversationRecord(conversationInput);

  if (!conversation) {
    return null;
  }

  mutateStore((store) => {
    const otherConversations = store.conversations.filter(
      (item) => item.id !== conversation.id,
    );

    return {
      ...store,
      updatedAt:
        conversation.updatedAt > store.updatedAt ? conversation.updatedAt : store.updatedAt,
      conversations: [conversation, ...otherConversations].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    };
  });

  return conversation;
}

function removeConversationFromStore(conversationId: string) {
  mutateStore((store) => ({
    ...store,
    updatedAt: getNowIso(),
    conversations: store.conversations.filter(
      (conversation) => conversation.id !== conversationId,
    ),
  }));
}

function mergeOwnerConversationSummariesFromServer(
  summaries: ChatConversationSummary[],
) {
  if (!summaries.length) {
    return;
  }

  mutateStore((store) => {
    const nextConversationById = new Map(
      store.conversations.map((conversation) => [conversation.id, conversation]),
    );
    let nextUpdatedAt = store.updatedAt;

    summaries.forEach((summary) => {
      const existingConversation = nextConversationById.get(summary.id);
      const shouldKeepThreadHydrated = Boolean(
        existingConversation &&
          existingConversation.threadHydrated !== false &&
          existingConversation.updatedAt >= summary.updatedAt &&
          existingConversation.messages.length >= summary.messageCount,
      );
      const shouldApplyRemoteMessageMeta =
        !existingConversation ||
        existingConversation.messages.length === 0 ||
        summary.messageCount > 0;
      const nextConversation = existingConversation
        ? {
            ...existingConversation,
            ownerId: summary.ownerId,
            clientName: summary.clientName,
            aiMode: summary.aiMode,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            status: summary.status,
            unreadClientCount: summary.unreadClientCount,
            unreadOwnerCount: summary.unreadOwnerCount,
            pendingManualTaskCount: summary.pendingManualTaskCount,
            messageCount: Math.max(summary.messageCount, existingConversation.messages.length),
            lastMessagePreview: shouldApplyRemoteMessageMeta
              ? summary.lastMessagePreview
              : existingConversation.lastMessagePreview ||
                getMessagePreview(existingConversation.messages.at(-1)),
            lastMessageSender: shouldApplyRemoteMessageMeta
              ? summary.lastMessageSender
              : existingConversation.lastMessageSender ||
                existingConversation.messages.at(-1)?.sender ||
                null,
            recoveryKey: summary.recoveryKey || existingConversation.recoveryKey || "",
            threadHydrated: shouldKeepThreadHydrated || summary.messageCount === 0,
          }
        : createConversationRecordFromSummary(summary);

      nextConversationById.set(summary.id, nextConversation);

      if (summary.updatedAt > nextUpdatedAt) {
        nextUpdatedAt = summary.updatedAt;
      }
    });

    return {
      ...store,
      updatedAt: nextUpdatedAt,
      conversations: [...nextConversationById.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    };
  });
}

async function requestOwnerConversationSummariesFromServer(
  ownerId: string,
  options?: SyncRequestOptions,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch("/api/owner/chat/summaries", {
      cache: "no-store",
      signal: options?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as OwnerConversationSummariesPayload;

    if (!Array.isArray(payload.summaries)) {
      return null;
    }

    const normalizedSummaries = payload.summaries
      .map((summary) => normalizeConversationSummaryRecord(summary))
      .filter((summary): summary is ChatConversationSummary => Boolean(summary))
      .filter((summary) => summary.ownerId === ownerId);

    mergeOwnerConversationSummariesFromServer(normalizedSummaries);

    return normalizedSummaries;
  } catch {
    return null;
  }
}

async function requestOwnerConversationThreadFromServer(
  ownerId: string,
  conversationId: string,
  options?: SyncRequestOptions,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch(
      `/api/owner/chat/conversations/${encodeURIComponent(conversationId)}`,
      {
        cache: "no-store",
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as OwnerConversationThreadPayload;
    const conversation = upsertConversationFromServer(payload.conversation);

    if (!conversation || conversation.ownerId !== ownerId) {
      return null;
    }

    return conversation;
  } catch {
    return null;
  }
}

async function requestOwnerConversationStateFromServer(
  ownerId: string,
  options?: SyncRequestOptions,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch("/api/owner/chat/state", {
      cache: "no-store",
      signal: options?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as OwnerConversationStatePayload;

    if (!Array.isArray(payload.conversations)) {
      return null;
    }

    const normalizedConversations = payload.conversations
      .map((conversation) => normalizeConversationRecord(conversation))
      .filter((conversation): conversation is ChatConversationRecord => Boolean(conversation))
      .filter((conversation) => conversation.ownerId === ownerId);

    mutateStore((store) => {
      const retainedConversations = store.conversations.filter(
        (conversation) => conversation.ownerId !== ownerId,
      );

      return {
        ...store,
        updatedAt:
          typeof payload.syncedAt === "string" && payload.syncedAt
            ? payload.syncedAt
            : store.updatedAt,
        conversations: [...normalizedConversations, ...retainedConversations].sort(
          (left, right) => right.updatedAt.localeCompare(left.updatedAt),
        ),
      };
    });

    return normalizedConversations;
  } catch {
    return null;
  }
}

async function requestClientConversationStateFromServer(
  session: ClientChatSession,
  options?: SyncRequestOptions,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const currentSnapshot = getConversationSnapshot(session.conversationId);
    const response = await browserWindow.fetch("/api/chat/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId: session.ownerId,
        conversationId: session.conversationId,
        clientKey: session.clientKey,
        updatedAfter:
          options?.forceFullSync || currentSnapshot?.conversation.threadHydrated === false
            ? ""
            : currentSnapshot?.conversation.updatedAt || "",
      }),
      signal: options?.signal,
    });

    if (response.status === 204) {
      return currentSnapshot?.conversation || null;
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ClientConversationStatePayload;

    return upsertConversationFromServer(payload.conversation);
  } catch {
    return null;
  }
}

async function requestPersistClientMessageToServer(
  session: ClientChatSession,
  message: ChatMessageRecord,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch("/api/chat/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId: session.ownerId,
        conversationId: session.conversationId,
        clientKey: session.clientKey,
        message,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      conversation?: unknown;
    };

    return upsertConversationFromServer(payload.conversation);
  } catch {
    return null;
  }
}

async function requestPersistOwnerMessageToServer(
  ownerId: string,
  conversationId: string,
  message: ChatMessageRecord,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch("/api/owner/chat/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId,
        conversationId,
        message,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      conversation?: unknown;
    };

    return upsertConversationFromServer(payload.conversation);
  } catch {
    return null;
  }
}

async function requestDeleteOwnerMessageToServer(
  conversationId: string,
  messageId: string,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch(
      `/api/owner/chat/conversations/${encodeURIComponent(
        conversationId,
      )}/messages/${encodeURIComponent(messageId)}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      conversation?: unknown;
    };

    return upsertConversationFromServer(payload.conversation);
  } catch {
    return null;
  }
}

async function requestDeleteOwnerConversationToServer(
  conversationId: string,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return false;
  }

  try {
    const response = await browserWindow.fetch(
      `/api/owner/chat/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: "DELETE",
      },
    );

    return response.ok;
  } catch {
    return false;
  }
}

async function requestOwnerManualAiGuidanceToServer(
  conversationId: string,
  taskId: string,
  guidance: string,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch(
      `/api/owner/chat/conversations/${encodeURIComponent(
        conversationId,
      )}/manual-ai-tasks/${encodeURIComponent(taskId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          guidance,
        }),
      },
    );

    const payload = (await response.json()) as
      | {
          conversation?: unknown;
          error?: string;
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || "Reprise manuelle impossible.");
    }

    return upsertConversationFromServer(payload?.conversation);
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw error;
    }

    throw new Error("Reprise manuelle impossible.");
  }
}

async function requestPersistSeenStateToServer(
  viewer: "owner" | "client",
  ownerId: string,
  conversationId: string,
  clientKey?: string,
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return;
  }

  try {
    if (viewer === "owner") {
      await browserWindow.fetch("/api/owner/chat/conversations/seen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ownerId,
          conversationId,
        }),
      });
      return;
    }

    if (!clientKey) {
      return;
    }

    await browserWindow.fetch("/api/chat/conversations/seen", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId,
        conversationId,
        clientKey,
      }),
    });
  } catch {
    // Best-effort server sync.
  }
}

async function requestPersistConversationConfigToServer(
  ownerId: string,
  conversationId: string,
  payload: {
    aiMode?: ChatConversationRecord["aiMode"];
    aiSettings?: Partial<ConversationAiSettings>;
  },
) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return null;
  }

  try {
    const response = await browserWindow.fetch("/api/owner/chat/conversations/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId,
        conversationId,
        ...payload,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const responsePayload = (await response.json()) as {
      conversation?: unknown;
    };

    return upsertConversationFromServer(responsePayload.conversation);
  } catch {
    return null;
  }
}

export function ensureClientConversation(
  ownerId: string,
  clientName: string,
): ClientChatSession {
  const trimmedClientName = clientName.trim();

  if (!trimmedClientName) {
    throw new Error("Le nom du client est obligatoire.");
  }

  const existingSession = getClientChatSession(ownerId);
  const currentStore = readStore();

  if (
    existingSession &&
    findConversationById(currentStore, existingSession.conversationId)
  ) {
    if (existingSession.clientName !== trimmedClientName) {
      const updatedSession = buildClientSession({
        ...existingSession,
        clientName: trimmedClientName,
      });
      persistClientChatSession(updatedSession);
    }

    mutateStore((store) => ({
      ...store,
      updatedAt: getNowIso(),
      conversations: store.conversations.map((conversation) =>
        conversation.id === existingSession.conversationId
          ? {
              ...conversation,
              clientName: trimmedClientName,
            }
          : conversation,
      ),
    }));

    return buildClientSession({
      ...existingSession,
      clientName: trimmedClientName,
    });
  }

  const session = buildClientSession({
    ownerId,
    clientName: trimmedClientName,
    clientKey: createClientKey(),
    conversationId: createId(),
    createdAt: getNowIso(),
  });

  mutateStore((store) => {
    return {
      ...store,
      updatedAt: getNowIso(),
      conversations: [
        createConversationRecordFromSession(session),
        ...store.conversations,
      ],
    };
  });

  persistClientChatSession(session);

  return session;
}

async function ensureClientConversationAccess(
  ownerId: string,
  clientName: string,
): Promise<ClientChatSession> {
  const trimmedClientName = clientName.trim();

  if (!trimmedClientName) {
    throw new Error("Le nom du client est obligatoire.");
  }

  const existingSession = getClientChatSession(ownerId);
  const currentStore = readStore();

  if (
    existingSession &&
    findConversationById(currentStore, existingSession.conversationId)
  ) {
    if (!existingSession.serverSessionId) {
      const issuedAccess = await requestIssuedClientAccess(
        ownerId,
        existingSession.conversationId,
        trimmedClientName,
        existingSession.clientKey,
      );
      const upgradedSession = buildClientSession({
        ownerId,
        clientName: issuedAccess.clientName,
        clientKey: issuedAccess.clientKey,
        clientKeyHash: issuedAccess.clientKeyHash,
        conversationId: issuedAccess.conversationId,
        createdAt: existingSession.createdAt,
        serverSessionId: issuedAccess.sessionId,
        lastValidatedAt: issuedAccess.validatedAt,
      });

      upsertConversationFromSession(upgradedSession);
      persistClientChatSession(upgradedSession);

      return upgradedSession;
    }

    const updatedSession = buildClientSession({
      ...existingSession,
      clientName: trimmedClientName,
    });

    persistClientChatSession(updatedSession);

    if (existingSession.clientName !== trimmedClientName) {
      upsertConversationFromSession(updatedSession);
    }

    return updatedSession;
  }

  if (existingSession?.clientKey) {
    if (!existingSession.serverSessionId) {
      const issuedAccess = await requestIssuedClientAccess(
        ownerId,
        existingSession.conversationId,
        trimmedClientName,
        existingSession.clientKey,
      );
      const restoredLegacySession = buildClientSession({
        ownerId,
        clientName: issuedAccess.clientName,
        clientKey: issuedAccess.clientKey,
        clientKeyHash: issuedAccess.clientKeyHash,
        conversationId: existingSession.conversationId,
        createdAt: existingSession.createdAt,
        serverSessionId: issuedAccess.sessionId,
        lastValidatedAt: issuedAccess.validatedAt,
      });

      upsertConversationFromSession(restoredLegacySession);
      persistClientChatSession(restoredLegacySession);

      return restoredLegacySession;
    }

    const restoredSession = await recoverClientConversation(
      ownerId,
      existingSession.clientKey,
      undefined,
      trimmedClientName,
    );

    return restoredSession;
  }

  const conversationId = createId();
  const issuedAccess = await requestIssuedClientAccess(
    ownerId,
    conversationId,
    trimmedClientName,
  );
  const session = buildClientSession({
    ownerId,
    clientName: issuedAccess.clientName,
    clientKey: issuedAccess.clientKey,
    clientKeyHash: issuedAccess.clientKeyHash,
    conversationId: issuedAccess.conversationId,
    createdAt: issuedAccess.createdAt,
    serverSessionId: issuedAccess.sessionId,
    lastValidatedAt: issuedAccess.validatedAt,
  });

  upsertConversationFromSession(session);
  persistClientChatSession(session);

  return session;
}

export async function recoverClientConversation(
  ownerId: string,
  clientKey: string,
  securityCode?: string,
  clientNameHint?: string,
) {
  const trimmedClientKey = clientKey.trim();

  if (!trimmedClientKey) {
    throw new Error("Entre ton ID de discussion.");
  }

  const validatedSession = await requestValidatedClientAccess(
    ownerId,
    trimmedClientKey,
    securityCode,
  );

  if (!validatedSession) {
    throw new Error("ID de discussion ou code invalide.");
  }

  const session = buildClientSession({
    ownerId,
    clientName: clientNameHint?.trim() || validatedSession.clientName,
    clientKey: trimmedClientKey,
    clientKeyHash: validatedSession.clientKeyHash,
    conversationId: validatedSession.conversationId,
    createdAt: validatedSession.createdAt,
    serverSessionId: validatedSession.id,
    lastValidatedAt: validatedSession.lastValidatedAt,
  });

  upsertConversationFromSession(session);
  persistClientChatSession(session);
  await requestClientConversationStateFromServer(session, {
    forceFullSync: true,
  });

  return session;
}

export async function initializeClientConversationAccess(
  ownerId: string,
  clientName: string,
) {
  return ensureClientConversationAccess(ownerId, clientName);
}

export async function setClientConversationSecurityCode(
  ownerId: string,
  securityCode: string,
) {
  const session = getClientChatSession(ownerId);

  if (!session) {
    throw new Error("Aucune discussion active a securiser.");
  }

  return requestSetClientSecurityCode(ownerId, session.clientKey, securityCode);
}

export async function validateClientSessionAccess(ownerId: string) {
  const session = getClientChatSession(ownerId);

  if (!session) {
    return true;
  }

  if (!session.serverSessionId) {
    return true;
  }

  const validatedSession = await requestValidatedClientAccess(
    ownerId,
    session.clientKey,
    undefined,
    session.conversationId,
  );

  if (!validatedSession) {
    clearClientChatSession(ownerId);
    return false;
  }

  const nextSession = buildClientSession({
    ...session,
    clientName: validatedSession.clientName,
    clientKeyHash: validatedSession.clientKeyHash,
    conversationId: validatedSession.conversationId,
    createdAt: validatedSession.createdAt,
    serverSessionId: validatedSession.id,
    lastValidatedAt: validatedSession.lastValidatedAt,
  });

  upsertConversationFromSession(nextSession);
  persistClientChatSession(nextSession);

  return true;
}

export async function syncOwnerConversationState(
  ownerId: string,
  options?: SyncRequestOptions,
) {
  const currentTask = ownerSyncTasks.get(ownerId);

  if (currentTask) {
    return currentTask;
  }

  const nextTask = (async () => {
    const startedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const summaries = await requestOwnerConversationSummariesFromServer(ownerId, options);

    if (summaries !== null) {
      const endedAt =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      recordPerfMetric(
        "chat-sync.owner-state",
        {
          path: "summaries",
          conversations: summaries.length,
        },
        endedAt - startedAt,
      );
      return summaries;
    }

    const result = await requestOwnerConversationStateFromServer(ownerId, options);
    const endedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    recordPerfMetric(
      "chat-sync.owner-state",
      {
        path: "fallback",
        conversations: Array.isArray(result) ? result.length : 0,
      },
      endedAt - startedAt,
    );
    return result;
  })().finally(() => {
    if (ownerSyncTasks.get(ownerId) === nextTask) {
      ownerSyncTasks.delete(ownerId);
    }
  });

  ownerSyncTasks.set(ownerId, nextTask);
  await nextTask;
}

export async function syncOwnerConversationThread(
  ownerId: string,
  conversationId: string,
  options?: SyncRequestOptions,
) {
  const normalizedConversationId = conversationId.trim();

  if (!normalizedConversationId) {
    return null;
  }

  const taskKey = `${ownerId}:${normalizedConversationId}`;
  const currentTask = ownerThreadSyncTasks.get(taskKey);

  if (currentTask) {
    return currentTask;
  }

  const nextTask = (async () => {
    const startedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const result = await requestOwnerConversationThreadFromServer(
      ownerId,
      normalizedConversationId,
      options,
    );
    const endedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    recordPerfMetric(
      "chat-sync.owner-thread",
      {
        conversationId: normalizedConversationId,
        messages: result?.messages.length || 0,
      },
      endedAt - startedAt,
    );
    return result;
  })().finally(() => {
    if (ownerThreadSyncTasks.get(taskKey) === nextTask) {
      ownerThreadSyncTasks.delete(taskKey);
    }
  });

  ownerThreadSyncTasks.set(taskKey, nextTask);
  return nextTask;
}

export async function syncClientConversationState(
  ownerId: string,
  options?: SyncRequestOptions,
) {
  const session = getClientChatSession(ownerId);

  if (!session) {
    return;
  }

  const currentTask = clientSyncTasks.get(ownerId);

  if (currentTask) {
    return currentTask;
  }

  const nextTask = (async () => {
    const startedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const result = await requestClientConversationStateFromServer(session, options);
    const endedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const conversation = findConversationById(readStore(), session.conversationId);
    recordPerfMetric(
      "chat-sync.client-state",
      {
        conversationId: session.conversationId,
        messages: conversation?.messages.length || 0,
      },
      endedAt - startedAt,
    );
    return result;
  })().finally(() => {
    if (clientSyncTasks.get(ownerId) === nextTask) {
      clientSyncTasks.delete(ownerId);
    }
  });

  clientSyncTasks.set(ownerId, nextTask);
  await nextTask;
}

export function setConversationAiMode(
  conversationId: string,
  aiMode: ChatConversationRecord["aiMode"],
) {
  if (aiMode !== "auto" && aiMode !== "suggestion" && aiMode !== "off") {
    throw new Error("Mode IA invalide.");
  }

  mutateStore((store) => ({
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            aiMode,
            autoReplyPending: aiMode === "auto" ? conversation.autoReplyPending : false,
          }
        : conversation,
      ),
  }));

  const snapshot = getConversationSnapshot(conversationId);

  if (!snapshot?.conversation) {
    return;
  }

  void requestPersistConversationConfigToServer(
    snapshot.conversation.ownerId,
    conversationId,
    {
      aiMode,
    },
  );
}

export function updateConversationAiSettings(
  conversationId: string,
  input: Partial<ConversationAiSettings>,
) {
  let nextAiSettings: ConversationAiSettings | null = null;
  let ownerId = "";

  mutateStore((store) => ({
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === conversationId
        ? (() => {
            const normalizedSettings = normalizeConversationAiSettings({
              ...conversation.aiSettings,
              ...input,
            });

            if (!ownerId) {
              ownerId = conversation.ownerId;
              nextAiSettings = normalizedSettings;
            }

            return {
              ...conversation,
              aiSettings: normalizedSettings,
            };
          })()
        : conversation,
    ),
  }));

  if (!ownerId || !nextAiSettings) {
    return;
  }

  void requestPersistConversationConfigToServer(ownerId, conversationId, {
    aiSettings: nextAiSettings,
  });
}

function finalizeAutoReply(
  conversationId: string,
  triggeringMessageId: string,
  reply: string,
) {
  const trimmedReply = reply.trim();

  mutateStore((store) => {
    const conversation = findConversationById(store, conversationId);

    if (!conversation) {
      return store;
    }

    const baseConversation: ChatConversationRecord = {
      ...conversation,
      autoReplyPending: false,
      lastAutoReplyToMessageId: triggeringMessageId,
    };

    const lastMessage = conversation.messages.at(-1);

    if (
      !trimmedReply ||
      conversation.status !== "active" ||
      conversation.aiMode !== "auto" ||
      !lastMessage ||
      lastMessage.sender !== "client" ||
      lastMessage.id !== triggeringMessageId
    ) {
      return {
        ...store,
        conversations: store.conversations.map((item) =>
          item.id === conversationId ? baseConversation : item,
        ),
      };
    }

    const nextMessage = createMessage(
      "ai",
      trimmedReply,
      createReplyReference(lastMessage),
    );

    return {
      ...store,
      updatedAt: nextMessage.timestamp,
      conversations: store.conversations.map((item) =>
        item.id === conversationId
          ? {
              ...baseConversation,
              updatedAt: nextMessage.timestamp,
              unreadClientCount: item.unreadClientCount + 1,
              messages: [...item.messages, nextMessage],
            }
          : item,
      ),
    };
  });
}

export async function requestAutoReplyIfNeeded(conversationId: string) {
  const browserWindow = safeWindow();

  if (!browserWindow || typeof browserWindow.fetch !== "function") {
    return;
  }

  const snapshot = getConversationSnapshot(conversationId);

  if (!snapshot) {
    return;
  }

  const { conversation } = snapshot;
  const lastMessage = conversation.messages.at(-1);
  const aiContext = buildAiConversationRequestPayload(conversation);

  if (
    conversation.aiMode !== "auto" ||
    conversation.status !== "active" ||
    conversation.autoReplyPending ||
    !lastMessage ||
    lastMessage.sender !== "client" ||
    conversation.lastAutoReplyToMessageId === lastMessage.id
  ) {
    return;
  }

  const triggeringMessageId = lastMessage.id;
  let hasLock = false;

  mutateStore((store) => {
    const liveConversation = findConversationById(store, conversationId);
    const liveLastMessage = liveConversation?.messages.at(-1);

    if (
      !liveConversation ||
      liveConversation.aiMode !== "auto" ||
      liveConversation.status !== "active" ||
      liveConversation.autoReplyPending ||
      !liveLastMessage ||
      liveLastMessage.sender !== "client" ||
      liveLastMessage.id !== triggeringMessageId ||
      liveConversation.lastAutoReplyToMessageId === triggeringMessageId
    ) {
      return store;
    }

    hasLock = true;

    return {
      ...store,
      conversations: store.conversations.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              autoReplyPending: true,
            }
          : item,
      ),
    };
  });

  if (!hasLock) {
    return;
  }

  let reply = "";
  let persistedConversation: ChatConversationRecord | null = null;

  try {
    const activeClientSession = getClientChatSession(conversation.ownerId);
    const isClientActor =
      Boolean(activeClientSession) &&
      activeClientSession?.conversationId === conversation.id;
    const response = await browserWindow.fetch("/api/chat/auto-reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId: conversation.ownerId,
        actor: isClientActor ? "client" : "owner",
        clientKey: isClientActor ? activeClientSession?.clientKey : "",
        conversationId: conversation.id,
        clientName: conversation.clientName,
        aiMode: "auto",
        conversationSettings: conversation.aiSettings,
        conversationSummary: aiContext.conversationSummary,
        messages: aiContext.messages,
      }),
    });

    const payload = (await response.json()) as
      | AutoReplyApiResponse
      | {
          error?: string;
        };

    if (
      !response.ok ||
      !("reply" in payload) ||
      typeof payload.reply !== "string"
    ) {
      throw new Error(
        "error" in payload && payload.error ? payload.error : "Auto-reponse impossible.",
      );
    }

    reply = payload.reply;
    if ("conversation" in payload) {
      persistedConversation = normalizeConversationRecord(payload.conversation);
    }
  } catch {
    mutateStore((store) => ({
      ...store,
      conversations: store.conversations.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              autoReplyPending: false,
            }
          : item,
      ),
    }));
    return;
  }

  if (persistedConversation) {
    upsertConversationFromServer(persistedConversation);
    return;
  }

  finalizeAutoReply(conversationId, triggeringMessageId, reply);
}

export async function sendClientMessage(
  ownerId: string,
  clientName: string,
  content: string | ChatMessageDraft,
  replyTo?: ChatMessageReplyReference | null,
) {
  const session = await ensureClientConversationAccess(ownerId, clientName);
  const normalizedInput = normalizeMessageDraft(content);
  let nextSession = session;
  const nextMessage = createMessage("client", normalizedInput, replyTo);
  const persistedConversation = await requestPersistClientMessageToServer(
    session,
    nextMessage,
  );

  if (!persistedConversation) {
    throw new Error("Message non sauvegarde. Reessaie.");
  }

  if (
    persistedConversation.clientKeyHash &&
    persistedConversation.clientKeyHash !== session.clientKeyHash
  ) {
    nextSession = buildClientSession({
      ...session,
      clientKeyHash: persistedConversation.clientKeyHash,
      lastValidatedAt: getNowIso(),
    });
    upsertConversationFromSession(nextSession);
    persistClientChatSession(nextSession);
  }

  return nextSession.conversationId;
}

export async function sendOwnerMessage(
  conversationId: string,
  content: string | ChatMessageDraft,
  replyTo?: ChatMessageReplyReference | null,
) {
  const snapshot = getConversationSnapshot(conversationId);

  if (!snapshot) {
    throw new Error("Conversation introuvable.");
  }

  const normalizedInput = normalizeMessageDraft(content);

  let ownerIdToPersist = snapshot.conversation.ownerId;
  const conversation = findConversationById(readStore(), conversationId);

  if (!conversation || conversation.status !== "active") {
    throw new Error("Conversation introuvable.");
  }

  ownerIdToPersist = conversation.ownerId;

  const nextMessage = createMessage("owner", normalizedInput, replyTo);
  const persistedConversation = await requestPersistOwnerMessageToServer(
    ownerIdToPersist,
    conversationId,
    nextMessage,
  );

  if (!persistedConversation) {
    throw new Error("Message non sauvegarde. Reessaie.");
  }
}

export async function deleteOwnerMessage(
  conversationId: string,
  messageId: string,
) {
  const snapshot = getConversationSnapshot(conversationId);

  if (!snapshot) {
    throw new Error("Conversation introuvable.");
  }

  const persistedConversation = await requestDeleteOwnerMessageToServer(
    conversationId,
    messageId,
  );

  if (!persistedConversation) {
    throw new Error("Message introuvable.");
  }

  return persistedConversation;
}

export async function deleteOwnerConversation(conversationId: string) {
  const snapshot = getConversationSnapshot(conversationId);

  if (!snapshot) {
    throw new Error("Conversation introuvable.");
  }

  const deleted = await requestDeleteOwnerConversationToServer(
    conversationId,
  );

  if (!deleted) {
    throw new Error("Discussion introuvable.");
  }

  removeConversationFromStore(conversationId);
}

export async function submitOwnerManualAiGuidance(
  conversationId: string,
  taskId: string,
  guidance: string,
) {
  const normalizedGuidance = guidance.trim();

  if (!normalizedGuidance) {
    throw new Error("Le contexte manuel est requis.");
  }

  const snapshot = getConversationSnapshot(conversationId);

  if (!snapshot) {
    throw new Error("Conversation introuvable.");
  }

  const persistedConversation = await requestOwnerManualAiGuidanceToServer(
    conversationId,
    taskId,
    normalizedGuidance,
  );

  if (!persistedConversation) {
    throw new Error("Reprise manuelle impossible.");
  }

  return persistedConversation;
}

export function markConversationSeen(
  conversationId: string,
  viewer: "owner" | "client",
) {
  let ownerId = "";
  let clientKey = "";

  mutateStore((store) => ({
    ...store,
    conversations: store.conversations.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation;
      }

      if (viewer === "owner" && conversation.unreadOwnerCount === 0) {
        return conversation;
      }

      if (viewer === "client" && conversation.unreadClientCount === 0) {
        return conversation;
      }

      if (!ownerId) {
        ownerId = conversation.ownerId;
      }

      if (viewer === "client" && !clientKey) {
        const session = getClientChatSession(conversation.ownerId);
        clientKey = session?.clientKey || "";
      }

      return {
        ...conversation,
        unreadOwnerCount: viewer === "owner" ? 0 : conversation.unreadOwnerCount,
        unreadClientCount:
          viewer === "client" ? 0 : conversation.unreadClientCount,
      };
    }),
  }));

  if (!ownerId) {
    return;
  }

  void requestPersistSeenStateToServer(
    viewer,
    ownerId,
    conversationId,
    clientKey || undefined,
  );
}

export function getOwnerConversationSummaries(
  ownerId: string,
): ChatConversationSummary[] {
  return readStore()
    .conversations
    .filter((conversation) => conversation.ownerId === ownerId)
    .map(toConversationSummary)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getConversationSnapshot(conversationId: string) {
  const conversation = findConversationById(readStore(), conversationId);

  if (!conversation) {
    return null;
  }

  return {
    conversation,
    summary: toConversationSummary(conversation),
  };
}

export function getClientConversationSnapshot(ownerId: string) {
  const session = getClientChatSession(ownerId);

  if (!session) {
    return {
      session: null,
      conversation: null,
      summary: null,
    };
  }

  const snapshot = getConversationSnapshot(session.conversationId);

  return {
    session,
    conversation: snapshot?.conversation || null,
    summary: snapshot?.summary || null,
  };
}

export function subscribeToChatSnapshots(listener: MessageListener) {
  const browserWindow = safeWindow();

  if (!browserWindow) {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === CHAT_STORAGE_KEY) {
      refreshStoreFromLocalStorage();
      listener();
      return;
    }

    if (event.key?.startsWith(CHAT_SESSION_PREFIX)) {
      listener();
    }
  };

  const onCustomEvent = () => {
    listener();
  };

  browserWindow.addEventListener("storage", onStorage);
  browserWindow.addEventListener("vichly-chat-updated", onCustomEvent);

  const channel = getSharedChatSyncChannel();
  let onMessage: ((event: MessageEvent) => void) | null = null;

  if (channel) {
    onMessage = () => {
      refreshStoreFromLocalStorage();
      listener();
    };
    channel.addEventListener("message", onMessage);
  }

  return () => {
    browserWindow.removeEventListener("storage", onStorage);
    browserWindow.removeEventListener("vichly-chat-updated", onCustomEvent);

    if (channel && onMessage) {
      channel.removeEventListener("message", onMessage);
    }
  };
}
