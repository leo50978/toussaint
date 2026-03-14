"use client";

import type { ChatMessageDraft, ChatMessageKind } from "@/lib/chat/types";
import { optimizeChatUploadFile } from "@/lib/chat/media-optimizer";

export type ChatUploadPayload = {
  assetId: string;
  kind: ChatMessageKind;
  storageUrl: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  durationMs: number | null;
  transcript: string;
};

export function detectChatMessageKind(file: File): ChatMessageKind {
  const mimeType = file.type.toLowerCase();

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "voice";
  }

  return "file";
}

export function toChatMessageDraftFromUpload(
  upload: ChatUploadPayload,
  content?: string,
): ChatMessageDraft {
  return {
    kind: upload.kind,
    content: content?.trim() || "",
    storageUrl: upload.storageUrl,
    mimeType: upload.mimeType,
    fileName: upload.fileName,
    fileSize: upload.fileSize,
    durationMs: upload.durationMs,
    transcript: upload.transcript,
  };
}

export async function uploadChatAttachment(
  file: File,
  options?: {
    kind?: ChatMessageKind;
    durationMs?: number | null;
    ownerId?: string;
    conversationId?: string;
    actor?: "client" | "owner";
    clientKey?: string;
    securityCode?: string;
  },
) {
  const fileToUpload = await optimizeChatUploadFile(file);
  const formData = new FormData();
  formData.append("file", fileToUpload);

  if (options?.kind) {
    formData.append("kind", options.kind);
  }

  if (typeof options?.durationMs === "number" && Number.isFinite(options.durationMs)) {
    formData.append("durationMs", String(Math.max(0, Math.round(options.durationMs))));
  }

  if (options?.ownerId) {
    formData.append("ownerId", options.ownerId);
  }

  if (options?.conversationId) {
    formData.append("conversationId", options.conversationId);
  }

  if (options?.actor) {
    formData.append("actor", options.actor);
  }

  if (options?.clientKey) {
    formData.append("clientKey", options.clientKey);
  }

  if (options?.securityCode) {
    formData.append("securityCode", options.securityCode);
  }

  const response = await fetch("/api/chat/uploads", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as
    | ChatUploadPayload
    | {
        error?: string;
      };

  if (!response.ok || !("storageUrl" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Upload impossible.",
    );
  }

  return payload;
}
