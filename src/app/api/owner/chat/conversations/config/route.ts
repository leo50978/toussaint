import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { patchConversation } from "@/lib/chat/persistence";
import type { ConversationAiSettings } from "@/lib/chat/types";

const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAiMode(value: unknown) {
  if (value === "auto" || value === "suggestion" || value === "off") {
    return value;
  }

  return null;
}

function normalizeAiSettings(value: unknown): Partial<ConversationAiSettings> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    tone: typeof value.tone === "string" ? value.tone : undefined,
    personalContext:
      typeof value.personalContext === "string" ? value.personalContext : undefined,
    maxLength: typeof value.maxLength === "number" ? value.maxLength : undefined,
    blacklistWords: Array.isArray(value.blacklistWords)
      ? value.blacklistWords.filter((word): word is string => typeof word === "string")
      : undefined,
    scheduleEnabled:
      typeof value.scheduleEnabled === "boolean" ? value.scheduleEnabled : undefined,
    scheduleStart:
      typeof value.scheduleStart === "string" ? value.scheduleStart : undefined,
    scheduleEnd: typeof value.scheduleEnd === "string" ? value.scheduleEnd : undefined,
    scheduleTimezone:
      typeof value.scheduleTimezone === "string" ? value.scheduleTimezone : undefined,
  };
}

function normalizeAdminAccessEnabled(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
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
  const aiMode = normalizeAiMode(rawPayload.aiMode);
  const aiSettings = normalizeAiSettings(rawPayload.aiSettings);
  const adminAccessEnabled = normalizeAdminAccessEnabled(rawPayload.adminAccessEnabled);

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

  if (!aiMode && !aiSettings && typeof adminAccessEnabled !== "boolean") {
    return NextResponse.json(
      {
        error: "Aucune configuration a enregistrer.",
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
      aiMode: aiMode || undefined,
      adminAccessEnabled,
      aiSettings: aiSettings as ConversationAiSettings | undefined,
    });

    return NextResponse.json({
      ok: true,
      conversation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Configuration impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
