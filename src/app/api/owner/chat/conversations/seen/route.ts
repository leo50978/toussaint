import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { patchConversation } from "@/lib/chat/persistence";

const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      {
        error: "Payload invalide.",
      },
      {
        status: 400,
      },
    );
  }

  const ownerId =
    typeof rawPayload.ownerId === "string" && rawPayload.ownerId.trim()
      ? rawPayload.ownerId
      : DEFAULT_OWNER_ID;
  const conversationId =
    typeof rawPayload.conversationId === "string" ? rawPayload.conversationId : "";

  if (!conversationId) {
    return NextResponse.json(
      {
        error: "Conversation invalide.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const conversation = await patchConversation({
      ownerId,
      conversationId,
      unreadOwnerCount: 0,
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
