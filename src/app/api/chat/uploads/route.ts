import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { validateClientAccessSession } from "@/lib/chat/client-access";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { buildRequestFingerprint, consumeSecurityWindow } from "@/lib/security/rate-limiter";
import type { ChatMessageKind } from "@/lib/chat/types";
import { saveChatUpload } from "@/lib/chat/media-server";

export const runtime = "nodejs";
const RATE_WINDOW_MS = 60_000;
const MAX_UPLOADS_PER_WINDOW = 24;
const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

function normalizeKind(value: FormDataEntryValue | null): ChatMessageKind | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (
    value === "voice" ||
    value === "image" ||
    value === "video" ||
    value === "file"
  ) {
    return value;
  }

  return undefined;
}

function normalizeDuration(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, parsed);
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<File>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function normalizeTextValue(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeActor(value: FormDataEntryValue | null) {
  if (value === "owner") {
    return "owner" as const;
  }

  if (value === "client") {
    return "client" as const;
  }

  return null;
}

async function consumeUploadSlot(request: Request, conversationId: string) {
  return consumeSecurityWindow({
    scope: "chat-upload",
    fingerprint: buildRequestFingerprint(request, [conversationId]),
    limit: MAX_UPLOADS_PER_WINDOW,
    windowMs: RATE_WINDOW_MS,
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const ownerId = normalizeTextValue(formData.get("ownerId"), 120);
    const conversationId = normalizeTextValue(formData.get("conversationId"), 120);
    const actor = normalizeActor(formData.get("actor"));
    const clientKey = normalizeTextValue(formData.get("clientKey"), 180);
    const securityCode = normalizeTextValue(formData.get("securityCode"), 180);

    if (!isUploadedFile(fileValue)) {
      return NextResponse.json(
        {
          error: "Aucun fichier recu.",
        },
        {
          status: 400,
        },
      );
    }

    if (!ownerId || ownerId !== DEFAULT_OWNER_ID) {
      return NextResponse.json(
        {
          error: "Owner invalide.",
        },
        {
          status: 403,
        },
      );
    }

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

    const rateLimit = await consumeUploadSlot(request, conversationId);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Trop d uploads. Reessaie dans quelques secondes.",
          rateLimit: rateLimit.status,
        },
        {
          status: 429,
        },
      );
    }

    if (!actor) {
      return NextResponse.json(
        {
          error: "Acteur upload invalide.",
        },
        {
          status: 400,
        },
      );
    }

    if (actor === "owner") {
      const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();

      if (!ownerIdentity) {
        return NextResponse.json(
          {
            error: "Session owner requise pour cet upload.",
          },
          {
            status: 401,
          },
        );
      }
    }

    if (actor === "client") {
      if (!clientKey) {
        return NextResponse.json(
          {
            error: "Cle client manquante.",
          },
          {
            status: 401,
          },
        );
      }

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
    }

    const savedAsset = await saveChatUpload(fileValue, {
      kind: normalizeKind(formData.get("kind")),
      durationMs: normalizeDuration(formData.get("durationMs")),
      ownerId,
      conversationId,
      actor,
    });

    return NextResponse.json(savedAsset);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 400,
      },
    );
  }
}
