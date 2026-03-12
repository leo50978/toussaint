import type {
  ConversationDocument,
  ConversationStatus,
  DeliveryStatus,
  MessageDocument,
  MessageKind,
  MessageSender,
} from "@/lib/firestore/schema";

export type ChatMessageReplyReference = NonNullable<MessageDocument["replyTo"]>;

export type ChatMessageRecord = MessageDocument & {
  id: string;
};

export type ChatMessageKind = MessageKind;

export type ChatMessageDraft = {
  kind?: MessageKind;
  content?: string;
  storageUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationMs?: number | null;
  transcript?: string;
  deliveryStatus?: DeliveryStatus;
};

export type ConversationAiSettings = {
  tone: string;
  personalContext: string;
  maxLength: number;
  blacklistWords: string[];
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  scheduleTimezone: string;
};

export type ConversationManualAiTask = {
  id: string;
  messageId: string;
  messageKind: MessageKind;
  reason: "media" | "keyword";
  keyword: string;
  ownerGuidance: string;
  status: "pending" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
};

export type ChatConversationRecord = ConversationDocument & {
  id: string;
  messages: ChatMessageRecord[];
  unreadClientCount: number;
  unreadOwnerCount: number;
  aiConversationSummary?: string;
  aiConversationSummaryUpdatedAt?: string | null;
  messageCount?: number;
  lastMessagePreview?: string;
  lastMessageSender?: MessageSender | null;
  pendingManualTaskCount?: number;
  threadHydrated?: boolean;
  aiSettings: ConversationAiSettings;
  autoReplyPending?: boolean;
  lastAutoReplyToMessageId?: string | null;
  manualAiTasks: ConversationManualAiTask[];
  recoveryKey?: string;
};

export type ChatStore = {
  version: 1;
  updatedAt: string;
  conversations: ChatConversationRecord[];
};

export type ClientChatSession = {
  ownerId: string;
  clientName: string;
  clientKey: string;
  clientKeyHash: string;
  conversationId: string;
  createdAt: string;
  serverSessionId: string | null;
  lastValidatedAt: string | null;
};

export type ChatConversationSummary = {
  id: string;
  ownerId: string;
  clientName: string;
  aiMode: ConversationDocument["aiMode"];
  adminAccessEnabled?: boolean;
  status: ConversationStatus;
  updatedAt: string;
  createdAt: string;
  unreadClientCount: number;
  unreadOwnerCount: number;
  messageCount: number;
  lastMessagePreview: string;
  lastMessageSender: MessageSender | null;
  pendingManualTaskCount: number;
  recoveryKey?: string;
};

export type SendChatMessageInput = {
  conversationId: string;
  sender: MessageSender;
  content?: string;
  kind?: MessageKind;
  storageUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationMs?: number | null;
  transcript?: string;
  replyTo?: ChatMessageReplyReference | null;
};

export type CreateClientConversationInput = {
  ownerId: string;
  clientName: string;
};

export type NormalizedChatMessageInput = {
  kind: MessageKind;
  content: string;
  storageUrl: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  durationMs: number | null;
  transcript: string;
  deliveryStatus: DeliveryStatus;
};
