import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";
import { createId } from "@/lib/utils/create-id";

import type {
  DraftEntryRecord,
  DraftEntryRole,
  DraftStoreFile,
  DraftUpsertInput,
  PrivateDraftRecord,
} from "./types";

const DRAFTS_DATA_DIR = join(process.cwd(), "data");
const DRAFTS_DATA_FILE = join(DRAFTS_DATA_DIR, "owner-drafts.json");
const DRAFTS_COLLECTION = "drafts";

function getNowIso() {
  return new Date().toISOString();
}

function getOwnerWorkspaceId() {
  return (
    process.env.OWNER_WORKSPACE_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
    "vichly-owner"
  );
}

function createDraftEntry(
  role: DraftEntryRole,
  content: string,
  timestamp: string,
  id?: string,
): DraftEntryRecord {
  return {
    id: id || createId(),
    role,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeDraftEntry(
  input: unknown,
  fallbackTimestamp: string,
): DraftEntryRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<DraftEntryRecord>;

  if (
    typeof candidate.id !== "string" ||
    (candidate.role !== "owner" && candidate.role !== "assistant") ||
    typeof candidate.content !== "string"
  ) {
    return null;
  }

  const content = candidate.content.trim().slice(0, 20_000);

  if (!content) {
    return null;
  }

  return {
    id: candidate.id,
    role: candidate.role,
    content,
    createdAt:
      typeof candidate.createdAt === "string" && candidate.createdAt
        ? candidate.createdAt
        : fallbackTimestamp,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : fallbackTimestamp,
  };
}

function buildEntriesFromLegacyContent(
  draftId: string,
  content: string,
  timestamp: string,
) {
  const normalizedContent = content.trim().slice(0, 20_000);

  if (!normalizedContent) {
    return [];
  }

  return [
    createDraftEntry("owner", normalizedContent, timestamp, `${draftId}_legacy_entry`),
  ];
}

function buildDraftContent(entries: DraftEntryRecord[]) {
  return entries
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20_000);
}

function normalizeDraft(input: Partial<PrivateDraftRecord>): PrivateDraftRecord | null {
  if (
    typeof input.id !== "string" ||
    typeof input.ownerId !== "string" ||
    typeof input.title !== "string" ||
    typeof input.content !== "string" ||
    typeof input.createdAt !== "string" ||
    typeof input.updatedAt !== "string" ||
    typeof input.isPinned !== "boolean" ||
    typeof input.isDeleted !== "boolean" ||
    !Array.isArray(input.tags)
  ) {
    return null;
  }

  const draftUpdatedAt = input.updatedAt;
  const normalizedEntries = Array.isArray(input.entries)
    ? input.entries
        .map((entry) => normalizeDraftEntry(entry, draftUpdatedAt))
        .filter((entry): entry is DraftEntryRecord => Boolean(entry))
    : buildEntriesFromLegacyContent(input.id, input.content, draftUpdatedAt);

  return {
    id: input.id,
    ownerId: input.ownerId,
    title: input.title,
    content: buildDraftContent(normalizedEntries),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    isPinned: input.isPinned,
    tags: input.tags.filter((tag): tag is string => typeof tag === "string"),
    isDeleted: input.isDeleted,
    entries: normalizedEntries,
    aiAssistantEnabled: Boolean(input.aiAssistantEnabled),
  };
}

function sortDrafts(drafts: PrivateDraftRecord[]) {
  return [...drafts].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function normalizeStoreFile(input: unknown): DraftStoreFile {
  if (!input || typeof input !== "object") {
    return {
      version: 1,
      updatedAt: getNowIso(),
      drafts: [],
    };
  }

  const candidate = input as Partial<DraftStoreFile>;
  const drafts = Array.isArray(candidate.drafts)
    ? candidate.drafts
        .map((draft) => normalizeDraft(draft))
        .filter((draft): draft is PrivateDraftRecord => Boolean(draft))
    : [];

  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : getNowIso(),
    drafts: sortDrafts(drafts),
  };
}

function normalizeTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 12)
    .map((tag) => tag.slice(0, 24));
}

function normalizeDraftInput(input: DraftUpsertInput) {
  const title = input.title.trim().slice(0, 140) || "Nouveau brouillon";
  const tags = normalizeTags(input.tags);
  const now = getNowIso();
  const normalizedEntries = Array.isArray(input.entries)
    ? input.entries
        .map((entry) => normalizeDraftEntry(entry, now))
        .filter((entry): entry is DraftEntryRecord => Boolean(entry))
    : buildEntriesFromLegacyContent(createId(), input.content, now);
  const content = buildDraftContent(normalizedEntries);

  return {
    title,
    content,
    tags,
    isPinned: Boolean(input.isPinned),
    entries: normalizedEntries,
    aiAssistantEnabled: Boolean(input.aiAssistantEnabled),
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
    };
    where: (fieldPath: string, opStr: "==", value: string) => {
      get: () => Promise<{
        docs: Array<{
          id: string;
          data: () => Record<string, unknown> | undefined;
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

function toFirestoreDraftPayload(draft: PrivateDraftRecord) {
  return {
    ownerId: draft.ownerId,
    title: draft.title,
    content: draft.content,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    isPinned: draft.isPinned,
    tags: draft.tags,
    isDeleted: draft.isDeleted,
    entries: draft.entries,
    aiAssistantEnabled: draft.aiAssistantEnabled,
  };
}

function fromFirestoreDraft(id: string, input: Record<string, unknown> | undefined) {
  if (!input) {
    return null;
  }

  return normalizeDraft({
    id,
    ownerId: typeof input.ownerId === "string" ? input.ownerId : "",
    title: typeof input.title === "string" ? input.title : "",
    content: typeof input.content === "string" ? input.content : "",
    createdAt: typeof input.createdAt === "string" ? input.createdAt : "",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : "",
    isPinned: Boolean(input.isPinned),
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    isDeleted: Boolean(input.isDeleted),
    entries: Array.isArray(input.entries) ? input.entries : undefined,
    aiAssistantEnabled: Boolean(input.aiAssistantEnabled),
  });
}

async function ensureDraftStoreFile() {
  await fs.mkdir(DRAFTS_DATA_DIR, {
    recursive: true,
  });

  try {
    await fs.access(DRAFTS_DATA_FILE);
  } catch {
    const emptyStore: DraftStoreFile = {
      version: 1,
      updatedAt: getNowIso(),
      drafts: [],
    };

    await fs.writeFile(DRAFTS_DATA_FILE, JSON.stringify(emptyStore, null, 2));
  }
}

async function readStoreFile() {
  await ensureDraftStoreFile();

  try {
    const raw = await fs.readFile(DRAFTS_DATA_FILE, "utf8");

    return normalizeStoreFile(JSON.parse(raw));
  } catch {
    const emptyStore: DraftStoreFile = {
      version: 1,
      updatedAt: getNowIso(),
      drafts: [],
    };

    await writeStoreFile(emptyStore);

    return emptyStore;
  }
}

async function writeStoreFile(store: DraftStoreFile) {
  const normalizedStore = normalizeStoreFile(store);

  await ensureDraftStoreFile();
  await fs.writeFile(
    DRAFTS_DATA_FILE,
    JSON.stringify(normalizedStore, null, 2),
    "utf8",
  );

  return normalizedStore;
}

export async function listOwnerDrafts() {
  const ownerId = getOwnerWorkspaceId();
  const firestoreDb = getFirestoreDb();

  if (firestoreDb) {
    const querySnapshot = await firestoreDb
      .collection(DRAFTS_COLLECTION)
      .where("ownerId", "==", ownerId)
      .get();
    const drafts = querySnapshot.docs
      .map((doc) => fromFirestoreDraft(doc.id, doc.data()))
      .filter((draft): draft is PrivateDraftRecord => Boolean(draft))
      .filter((draft) => !draft.isDeleted);

    return {
      ownerId,
      syncedAt: getNowIso(),
      drafts: sortDrafts(drafts),
    };
  }

  const store = await readStoreFile();

  return {
    ownerId,
    syncedAt: store.updatedAt,
    drafts: store.drafts.filter(
      (draft) => draft.ownerId === ownerId && !draft.isDeleted,
    ),
  };
}

export async function getOwnerDraft(draftId: string) {
  const ownerId = getOwnerWorkspaceId();
  const firestoreDb = getFirestoreDb();

  if (firestoreDb) {
    const draftSnapshot = await firestoreDb.collection(DRAFTS_COLLECTION).doc(draftId).get();

    if (!draftSnapshot.exists) {
      return null;
    }

    const draft = fromFirestoreDraft(draftSnapshot.id, draftSnapshot.data());

    if (!draft || draft.ownerId !== ownerId || draft.isDeleted) {
      return null;
    }

    return draft;
  }

  const store = await readStoreFile();

  return (
    store.drafts.find(
      (draft) => draft.id === draftId && draft.ownerId === ownerId && !draft.isDeleted,
    ) || null
  );
}

export async function createOwnerDraft(input?: Partial<DraftUpsertInput>) {
  const ownerId = getOwnerWorkspaceId();
  const firestoreDb = getFirestoreDb();
  const now = getNowIso();
  const normalizedInput = normalizeDraftInput({
    title: input?.title || "Nouveau brouillon",
    content: input?.content || "",
    tags: input?.tags || [],
    isPinned: input?.isPinned || false,
    entries: input?.entries,
    aiAssistantEnabled: input?.aiAssistantEnabled,
  });

  const draft: PrivateDraftRecord = {
    id: createId(),
    ownerId,
    title: normalizedInput.title,
    content: normalizedInput.content,
    createdAt: now,
    updatedAt: now,
    isPinned: normalizedInput.isPinned,
    tags: normalizedInput.tags,
    isDeleted: false,
    entries: normalizedInput.entries,
    aiAssistantEnabled: normalizedInput.aiAssistantEnabled,
  };

  if (firestoreDb) {
    await firestoreDb
      .collection(DRAFTS_COLLECTION)
      .doc(draft.id)
      .set(toFirestoreDraftPayload(draft));

    return {
      draft,
      syncedAt: now,
    };
  }

  const store = await readStoreFile();
  const nextStore = await writeStoreFile({
    ...store,
    updatedAt: now,
    drafts: [draft, ...store.drafts],
  });

  return {
    draft,
    syncedAt: nextStore.updatedAt,
  };
}

export async function updateOwnerDraft(
  draftId: string,
  input: DraftUpsertInput,
) {
  const ownerId = getOwnerWorkspaceId();
  const firestoreDb = getFirestoreDb();

  if (firestoreDb) {
    const draftRef = firestoreDb.collection(DRAFTS_COLLECTION).doc(draftId);
    const draftSnapshot = await draftRef.get();

    if (!draftSnapshot.exists) {
      return null;
    }

    const currentDraft = fromFirestoreDraft(draftSnapshot.id, draftSnapshot.data());

    if (!currentDraft || currentDraft.ownerId !== ownerId || currentDraft.isDeleted) {
      return null;
    }

    const normalizedInput = normalizeDraftInput(input);
    const updatedDraft: PrivateDraftRecord = {
      ...currentDraft,
      ...normalizedInput,
      updatedAt: getNowIso(),
    };

    await draftRef.set(toFirestoreDraftPayload(updatedDraft));

    return {
      draft: updatedDraft,
      syncedAt: updatedDraft.updatedAt,
    };
  }

  const store = await readStoreFile();
  const currentDraft = store.drafts.find(
    (draft) => draft.id === draftId && draft.ownerId === ownerId && !draft.isDeleted,
  );

  if (!currentDraft) {
    return null;
  }

  const normalizedInput = normalizeDraftInput(input);
  const updatedDraft: PrivateDraftRecord = {
    ...currentDraft,
    ...normalizedInput,
    updatedAt: getNowIso(),
  };

  const nextStore = await writeStoreFile({
    ...store,
    updatedAt: updatedDraft.updatedAt,
    drafts: store.drafts.map((draft) =>
      draft.id === draftId ? updatedDraft : draft,
    ),
  });

  return {
    draft: updatedDraft,
    syncedAt: nextStore.updatedAt,
  };
}

export async function deleteOwnerDraft(draftId: string) {
  const ownerId = getOwnerWorkspaceId();
  const firestoreDb = getFirestoreDb();

  if (firestoreDb) {
    const draftRef = firestoreDb.collection(DRAFTS_COLLECTION).doc(draftId);
    const draftSnapshot = await draftRef.get();

    if (!draftSnapshot.exists) {
      return false;
    }

    const currentDraft = fromFirestoreDraft(draftSnapshot.id, draftSnapshot.data());

    if (!currentDraft || currentDraft.ownerId !== ownerId || currentDraft.isDeleted) {
      return false;
    }

    const deletedAt = getNowIso();

    await draftRef.set({
      ...toFirestoreDraftPayload({
        ...currentDraft,
        isDeleted: true,
        updatedAt: deletedAt,
      }),
    });

    return true;
  }

  const store = await readStoreFile();
  const currentDraft = store.drafts.find(
    (draft) => draft.id === draftId && draft.ownerId === ownerId && !draft.isDeleted,
  );

  if (!currentDraft) {
    return false;
  }

  const deletedAt = getNowIso();

  await writeStoreFile({
    ...store,
    updatedAt: deletedAt,
    drafts: store.drafts.map((draft) =>
      draft.id === draftId
        ? {
            ...draft,
            isDeleted: true,
            updatedAt: deletedAt,
          }
        : draft,
    ),
  });

  return true;
}
