import { NextResponse } from "next/server";

import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { validateChatMessageInput } from "@/lib/security/message-guard";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  let rawPayload: unknown = {};

  try {
    rawPayload = await request.json();
  } catch {
    rawPayload = {};
  }

  if (!isObject(rawPayload)) {
    return NextResponse.json(
      {
        error: "Payload invalide.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await validateChatMessageInput({
      role: "client",
      ownerId: typeof rawPayload.ownerId === "string" ? rawPayload.ownerId : "",
      conversationId:
        typeof rawPayload.conversationId === "string" ? rawPayload.conversationId : "",
      clientKey:
        typeof rawPayload.clientKey === "string" ? rawPayload.clientKey : "",
      content: typeof rawPayload.content === "string" ? rawPayload.content : "",
    });

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: result.reason,
          rateLimit: result.rateLimit,
        },
        {
          status: result.status,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      content: result.content,
      rateLimit: result.rateLimit,
      clientKeyHash: result.clientKeyHash,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Validation impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
