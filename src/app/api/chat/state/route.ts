import { NextResponse } from "next/server";

import { validateClientAccessSession } from "@/lib/chat/client-access";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { getClientConversationState } from "@/lib/chat/persistence";

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
      { error: "Payload invalide." },
      { status: 400 },
    );
  }

  const ownerId = typeof rawPayload.ownerId === "string" ? rawPayload.ownerId : "";
  const conversationId =
    typeof rawPayload.conversationId === "string" ? rawPayload.conversationId : "";
  const clientKey =
    typeof rawPayload.clientKey === "string" ? rawPayload.clientKey : "";
  const securityCode =
    typeof rawPayload.securityCode === "string" ? rawPayload.securityCode : "";
  const updatedAfter =
    typeof rawPayload.updatedAfter === "string" ? rawPayload.updatedAfter.trim() : "";

  try {
    const validation = await validateClientAccessSession({
      ownerId,
      conversationId,
      clientKey,
      securityCode,
    });

    if (!validation.valid || !validation.session) {
      return NextResponse.json(
        { error: "Cle client invalide." },
        { status: 403 },
      );
    }

    const conversation = await getClientConversationState(ownerId, conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Discussion introuvable." },
        { status: 404 },
      );
    }

    if (updatedAfter && conversation.updatedAt <= updatedAfter) {
      return new NextResponse(null, {
        status: 204,
      });
    }

    return NextResponse.json({
      conversation,
      session: validation.session,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lecture de discussion impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
