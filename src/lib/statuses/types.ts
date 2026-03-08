import type { StatusDocument, StatusType } from "@/lib/firestore/schema";

export type PrivateStatusRecord = StatusDocument & {
  id: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  originalName: string;
  storageBackend: "local" | "firebase";
  storagePath: string;
};

export type StatusStoreFile = {
  version: 1;
  updatedAt: string;
  statuses: PrivateStatusRecord[];
};

export type CreateStatusInput = {
  type: StatusType;
  content: string;
  file?: File | null;
};
