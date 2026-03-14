import { NextResponse } from "next/server";

import { validateClientAccessSession } from "@/lib/chat/client-access";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { patchConversation } from "@/lib/chat/persistence";

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

  const ownerId = typeof rawPayload.ownerId === "string" ? rawPayload.ownerId : "";
  const conversationId =
    typeof rawPayload.conversationId === "string" ? rawPayload.conversationId : "";
  const clientKey =
    typeof rawPayload.clientKey === "string" ? rawPayload.clientKey : "";
  const securityCode =
    typeof rawPayload.securityCode === "string" ? rawPayload.securityCode : "";

  try {
    const validation = await validateClientAccessSession({
      ownerId,
      conversationId,
      clientKey,
      securityCode,
    });

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Cle client invalide.",
        },
        {
          status: 403,
        },
      );
    }

    const conversation = await patchConversation({
      ownerId,
      conversationId,
      unreadClientCount: 0,
    });

    return NextResponse.json({
      ok: true,
      conversation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Mise a jour impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
