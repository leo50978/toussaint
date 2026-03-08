import type { DraftDocument } from "@/lib/firestore/schema";

export type DraftEntryRole = "owner" | "assistant";

export type DraftEntryRecord = {
  id: string;
  role: DraftEntryRole;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type PrivateDraftRecord = DraftDocument & {
  id: string;
  entries: DraftEntryRecord[];
  aiAssistantEnabled: boolean;
};

export type DraftStoreFile = {
  version: 1;
  updatedAt: string;
  drafts: PrivateDraftRecord[];
};

export type DraftUpsertInput = {
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  entries?: DraftEntryRecord[];
  aiAssistantEnabled?: boolean;
};
