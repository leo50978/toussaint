export const AI_MODES = ["auto", "suggestion", "off"] as const;
export const CONVERSATION_STATUSES = ["active", "archived", "blocked"] as const;
export const MESSAGE_SENDERS = ["client", "owner", "ai"] as const;
export const MESSAGE_KINDS = ["text", "voice", "image", "video", "file"] as const;
export const DELIVERY_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const;
export const STATUS_TYPES = ["text", "image", "video"] as const;

export type AiMode = (typeof AI_MODES)[number];
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type MessageSender = (typeof MESSAGE_SENDERS)[number];
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type StatusType = (typeof STATUS_TYPES)[number];

export type FirestoreTimestampField = string;

export type ConversationDocument = {
  ownerId: string;
  clientName: string;
  clientKeyHash: string;
  aiMode: AiMode;
  createdAt: FirestoreTimestampField;
  updatedAt: FirestoreTimestampField;
  status: ConversationStatus;
  aiConversationSummary?: string;
  aiConversationSummaryUpdatedAt?: FirestoreTimestampField | null;
};

export type MessageDocument = {
  sender: MessageSender;
  kind: MessageKind;
  content: string;
  storageUrl: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  durationMs: number | null;
  transcript: string;
  timestamp: FirestoreTimestampField;
  deliveryStatus: DeliveryStatus;
};

export type StatusDocument = {
  ownerId: string;
  type: StatusType;
  content: string;
  storageUrl: string;
  createdAt: FirestoreTimestampField;
  expiresAt: FirestoreTimestampField;
  viewCount: number;
};

export type OwnerSecurityDocument = {
  initialized: boolean;
  ownerUid: string;
  ownerEmail: string;
  createdAt: FirestoreTimestampField | null;
  setupCompletedAt: FirestoreTimestampField | null;
  updatedAt: FirestoreTimestampField;
};

export type ClientAccessSessionDocument = {
  id: string;
  ownerId: string;
  conversationId: string;
  clientName: string;
  clientKeyHash: string;
  securityCodeHash: string | null;
  createdAt: FirestoreTimestampField;
  updatedAt: FirestoreTimestampField;
  lastValidatedAt: FirestoreTimestampField | null;
};

export type ChatAssetDocument = {
  assetId: string;
  ownerId: string;
  conversationId: string;
  kind: MessageKind;
  mimeType: string;
  fileName: string;
  fileSize: number;
  storageBackend: "local" | "firebase";
  storagePath: string;
  createdAt: FirestoreTimestampField;
};

export type SecurityBucketDocument = {
  scope: string;
  fingerprintHash: string;
  windowMs: number;
  windowStartedAt: FirestoreTimestampField;
  resetAt: FirestoreTimestampField;
  expiresAt: FirestoreTimestampField;
  limit: number;
  count: number;
  updatedAt: FirestoreTimestampField;
};

export type DraftDocument = {
  ownerId: string;
  title: string;
  content: string;
  createdAt: FirestoreTimestampField;
  updatedAt: FirestoreTimestampField;
  isPinned: boolean;
  tags: string[];
  isDeleted: boolean;
};

export type SettingsDocument = {
  aiDefaultMode: AiMode;
  aiTone: string;
  aiMaxLength: number;
  businessContext: string;
  blacklistWords: string[];
  updatedAt: FirestoreTimestampField;
};

export type CollectionSchema = {
  collection: string;
  scope: "root" | "subcollection";
  ownerAccess: "read-write" | "write-only" | "read-only" | "none";
  clientAccess: "read-write" | "write-only" | "read-only" | "none";
  description: string;
  documentShape: string[];
};

export const FIRESTORE_COLLECTIONS = {
  conversations: "conversations",
  messages: "messages",
  statuses: "statuses",
  drafts: "drafts",
  settings: "settings",
  ownerSecurity: "ownerSecurity",
  clientAccessSessions: "clientAccessSessions",
  chatAssets: "chatAssets",
  securityBuckets: "securityBuckets",
} as const;

export const FIRESTORE_SCHEMA: CollectionSchema[] = [
  {
    collection: FIRESTORE_COLLECTIONS.conversations,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Conversation metadata. Accessed privately through backend routes and Admin SDK only.",
    documentShape: [
      "ownerId:string",
      "clientName:string",
      "clientKeyHash:string",
      "aiMode:auto|suggestion|off",
      "createdAt:timestamp",
      "updatedAt:timestamp",
      "status:active|archived|blocked",
      "aiConversationSummary?:string",
      "aiConversationSummaryUpdatedAt?:timestamp|null",
    ],
  },
  {
    collection: `${FIRESTORE_COLLECTIONS.conversations}/{conversationId}/${FIRESTORE_COLLECTIONS.messages}`,
    scope: "subcollection",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Conversation messages. Accessed privately through backend routes and Admin SDK only.",
    documentShape: [
      "sender:client|owner|ai",
      "kind:text|voice|image|video|file",
      "content:string",
      "storageUrl:string",
      "mimeType:string",
      "fileName:string",
      "fileSize:number",
      "durationMs:number|null",
      "transcript:string",
      "timestamp:timestamp",
      "deliveryStatus:queued|sent|delivered|read|failed",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.statuses,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "read-only",
    description:
      "Ephemeral business statuses. The backend manages writes; public clients can only read non-expired statuses through restricted access.",
    documentShape: [
      "ownerId:string",
      "type:text|image|video",
      "content:string",
      "storageUrl:string",
      "createdAt:timestamp",
      "expiresAt:timestamp",
      "viewCount:number",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.drafts,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Private notes, templates and pinned drafts. Fully isolated behind backend routes.",
    documentShape: [
      "ownerId:string",
      "title:string",
      "content:string",
      "createdAt:timestamp",
      "updatedAt:timestamp",
      "isPinned:boolean",
      "tags:string[]",
      "isDeleted:boolean",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.settings,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Global business and AI settings. One document per owner, never exposed directly to public clients.",
    documentShape: [
      "aiDefaultMode:auto|suggestion|off",
      "aiTone:string",
      "aiMaxLength:number",
      "businessContext:string",
      "blacklistWords:string[]",
      "updatedAt:timestamp",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.ownerSecurity,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Owner registry and setup state. Server-only authority for admin identity.",
    documentShape: [
      "initialized:boolean",
      "ownerUid:string",
      "ownerEmail:string",
      "createdAt:timestamp|null",
      "setupCompletedAt:timestamp|null",
      "updatedAt:timestamp",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.clientAccessSessions,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Recovery sessions and security codes for public clients. Server-only access.",
    documentShape: [
      "id:string",
      "ownerId:string",
      "conversationId:string",
      "clientName:string",
      "clientKeyHash:string",
      "securityCodeHash:string|null",
      "createdAt:timestamp",
      "updatedAt:timestamp",
      "lastValidatedAt:timestamp|null",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.chatAssets,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Chat media metadata. Binary content is stored in Storage and served through backend routes only.",
    documentShape: [
      "assetId:string",
      "ownerId:string",
      "conversationId:string",
      "kind:text|voice|image|video|file",
      "mimeType:string",
      "fileName:string",
      "fileSize:number",
      "storageBackend:local|firebase",
      "storagePath:string",
      "createdAt:timestamp",
    ],
  },
  {
    collection: FIRESTORE_COLLECTIONS.securityBuckets,
    scope: "root",
    ownerAccess: "none",
    clientAccess: "none",
    description:
      "Rate-limit windows and abuse-prevention counters. Server-only collection.",
    documentShape: [
      "scope:string",
      "fingerprintHash:string",
      "windowMs:number",
      "windowStartedAt:timestamp",
      "resetAt:timestamp",
      "expiresAt:timestamp",
      "limit:number",
      "count:number",
      "updatedAt:timestamp",
    ],
  },
];

export type FirestoreIndexSpec = {
  collectionGroup: string;
  queryScope: "COLLECTION" | "COLLECTION_GROUP";
  fields: Array<{
    fieldPath: string;
    order?: "ASCENDING" | "DESCENDING";
    arrayConfig?: "CONTAINS";
  }>;
};

export const FIRESTORE_INDEXES: FirestoreIndexSpec[] = [
  {
    collectionGroup: FIRESTORE_COLLECTIONS.conversations,
    queryScope: "COLLECTION",
    fields: [
      {
        fieldPath: "ownerId",
        order: "ASCENDING",
      },
      {
        fieldPath: "updatedAt",
        order: "DESCENDING",
      },
    ],
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.conversations,
    queryScope: "COLLECTION",
    fields: [
      {
        fieldPath: "ownerId",
        order: "ASCENDING",
      },
      {
        fieldPath: "status",
        order: "ASCENDING",
      },
      {
        fieldPath: "updatedAt",
        order: "DESCENDING",
      },
    ],
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.messages,
    queryScope: "COLLECTION_GROUP",
    fields: [
      {
        fieldPath: "sender",
        order: "ASCENDING",
      },
      {
        fieldPath: "timestamp",
        order: "DESCENDING",
      },
    ],
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.statuses,
    queryScope: "COLLECTION",
    fields: [
      {
        fieldPath: "ownerId",
        order: "ASCENDING",
      },
      {
        fieldPath: "expiresAt",
        order: "DESCENDING",
      },
    ],
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.drafts,
    queryScope: "COLLECTION",
    fields: [
      {
        fieldPath: "ownerId",
        order: "ASCENDING",
      },
      {
        fieldPath: "isDeleted",
        order: "ASCENDING",
      },
      {
        fieldPath: "updatedAt",
        order: "DESCENDING",
      },
    ],
  },
  {
    collectionGroup: FIRESTORE_COLLECTIONS.drafts,
    queryScope: "COLLECTION",
    fields: [
      {
        fieldPath: "ownerId",
        order: "ASCENDING",
      },
      {
        fieldPath: "tags",
        arrayConfig: "CONTAINS",
      },
      {
        fieldPath: "updatedAt",
        order: "DESCENDING",
      },
    ],
  },
];

export function getFirestoreDataModelSummary() {
  return {
    collections: FIRESTORE_SCHEMA,
    indexes: FIRESTORE_INDEXES,
    enums: {
      aiModes: AI_MODES,
      conversationStatuses: CONVERSATION_STATUSES,
      messageSenders: MESSAGE_SENDERS,
      deliveryStatuses: DELIVERY_STATUSES,
      statusTypes: STATUS_TYPES,
    },
    counts: {
      collections: FIRESTORE_SCHEMA.length,
      indexes: FIRESTORE_INDEXES.length,
    },
    assumptions: [
      "Le runtime prive repose sur Firebase Admin SDK et non sur des ecritures directes client Firestore.",
      "Les clients publics restent anonymes et ne peuvent jamais lire directement conversations, messages, drafts, settings ou registres de securite.",
      "Les statuts sont le seul contenu public-by-design, et seulement tant qu ils ne sont pas expires.",
      "Les medias et compteurs de securite sont servis ou modifies uniquement via le backend.",
    ],
  };
}
