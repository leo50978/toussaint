import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { appendConversationMessage } from "@/lib/chat/persistence";
import type { ChatMessageRecord } from "@/lib/chat/types";
import { validateChatMessageInput } from "@/lib/security/message-guard";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeReplyReference(input: unknown): ChatMessageRecord["replyTo"] {
  if (!isObject(input)) {
    return null;
  }

  const sender =
    input.sender === "client" || input.sender === "owner" || input.sender === "ai"
      ? input.sender
      : null;
  const kind =
    input.kind === "text" ||
    input.kind === "voice" ||
    input.kind === "image" ||
    input.kind === "video" ||
    input.kind === "file"
      ? input.kind
      : null;

  if (
    !sender ||
    !kind ||
    typeof input.messageId !== "string" ||
    typeof input.timestamp !== "string"
  ) {
    return null;
  }

  return {
    messageId: input.messageId.trim().slice(0, 120),
    sender,
    kind,
    content:
      typeof input.content === "string" ? input.content.trim().slice(0, 240) : "",
    fileName:
      typeof input.fileName === "string" ? input.fileName.trim().slice(0, 160) : "",
    timestamp: input.timestamp,
  };
}

function normalizeMessage(input: unknown): ChatMessageRecord | null {
  if (!isObject(input)) {
    return null;
  }

  const sender = input.sender === "owner" || input.sender === "ai" ? input.sender : null;
  const kind =
    input.kind === "text" ||
    input.kind === "voice" ||
    input.kind === "image" ||
    input.kind === "video" ||
    input.kind === "file"
      ? input.kind
      : null;

  if (
    !sender ||
    !kind ||
    typeof input.id !== "string" ||
    typeof input.timestamp !== "string" ||
    typeof input.content !== "string"
  ) {
    return null;
  }

  const normalized: ChatMessageRecord = {
    id: input.id.trim().slice(0, 120),
    sender,
    kind,
    content: input.content.trim().slice(0, 2_000),
    storageUrl:
      typeof input.storageUrl === "string" ? input.storageUrl.trim().slice(0, 1_500) : "",
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
      typeof input.transcript === "string" ? input.transcript.trim().slice(0, 3_000) : "",
    timestamp: input.timestamp,
    deliveryStatus:
      input.deliveryStatus === "queued" ||
      input.deliveryStatus === "sent" ||
      input.deliveryStatus === "delivered" ||
      input.deliveryStatus === "read" ||
      input.deliveryStatus === "failed"
        ? input.deliveryStatus
        : "delivered",
    replyTo: normalizeReplyReference(input.replyTo),
  };

  if (!normalized.id) {
    return null;
  }

  if (normalized.kind !== "text" && !normalized.storageUrl) {
    return null;
  }

  return normalized;
}

export async function POST(request: Request) {
  const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();

  if (!ownerIdentity) {
    return NextResponse.json(
      {
        error: "Session owner requise.",
      },
      {
        status: 401,
      },
    );
  }

  let rawPayload: unknown = {};

  try {
    rawPayload = await request.json();
  } catch {
    rawPayload = {};
  }

  if (!isObject(rawPayload)) {
    return NextResponse.json(
      { error: "Payload invalide." },
      { status: 400 },
    );
  }

  const ownerId = typeof rawPayload.ownerId === "string" ? rawPayload.ownerId : "";
  const conversationId =
    typeof rawPayload.conversationId === "string" ? rawPayload.conversationId : "";
  const normalizedMessage = normalizeMessage(rawPayload.message);

  if (!ownerId || !conversationId || !normalizedMessage) {
    return NextResponse.json(
      { error: "Message invalide." },
      { status: 400 },
    );
  }

  try {
    if (normalizedMessage.kind === "text" && normalizedMessage.sender !== "ai") {
      const guard = await validateChatMessageInput({
        role: "owner",
        ownerId,
        conversationId,
        content: normalizedMessage.content,
      });

      if (!guard.allowed) {
        return NextResponse.json(
          {
            error: guard.reason,
            rateLimit: guard.rateLimit,
          },
          {
            status: guard.status,
          },
        );
      }

      normalizedMessage.content = guard.content;
    }

    const conversation = await appendConversationMessage({
      ownerId,
      conversationId,
      sender: normalizedMessage.sender,
      message: normalizedMessage,
    });

    return NextResponse.json({
      ok: true,
      conversation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Message impossible a sauvegarder.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
