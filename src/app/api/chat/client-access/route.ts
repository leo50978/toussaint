import { NextResponse } from "next/server";

import {
  issueClientAccessSession,
  setClientAccessSecurityCode,
  validateClientAccessSession,
} from "@/lib/chat/client-access";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { ensureConversationAccessSeed } from "@/lib/chat/persistence";
import { recordMonitoringEvent } from "@/lib/monitoring/logger";
import { buildRequestFingerprint, consumeSecurityWindow } from "@/lib/security/rate-limiter";

export const runtime = "nodejs";
const RATE_WINDOW_MS = 60_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRateLimitForAction(action: string) {
  if (action === "recover" || action === "validate") {
    return 14;
  }

  if (action === "secure") {
    return 10;
  }

  return 20;
}

async function consumeActionSlot(request: Request, action: string, ownerId: string) {
  const limit = getRateLimitForAction(action);

  return consumeSecurityWindow({
    scope: `client-access:${action}`,
    fingerprint: buildRequestFingerprint(request, [ownerId]),
    limit,
    windowMs: RATE_WINDOW_MS,
  });
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

  const action =
    typeof rawPayload.action === "string" ? rawPayload.action : "validate";
  const ownerId = typeof rawPayload.ownerId === "string" ? rawPayload.ownerId : "";

  const rateLimit = await consumeActionSlot(request, action, ownerId);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Trop de tentatives. Reessaie dans quelques instants.",
        rateLimit: rateLimit.status,
      },
      {
        status: 429,
      },
    );
  }

  if (action === "issue") {
    try {
      const result = await issueClientAccessSession({
        ownerId,
        conversationId:
          typeof rawPayload.conversationId === "string"
            ? rawPayload.conversationId
            : "",
        clientName:
          typeof rawPayload.clientName === "string" ? rawPayload.clientName : "",
        previousClientKey:
          typeof rawPayload.previousClientKey === "string"
            ? rawPayload.previousClientKey
            : "",
      });

      await ensureConversationAccessSeed({
        ownerId: result.ownerId,
        conversationId: result.conversationId,
        clientName: result.clientName,
        clientKeyHash: result.clientKeyHash,
        recoveryKey: result.clientKey,
        createdAt: result.createdAt,
      });

      return NextResponse.json(result, {
        status: 201,
      });
    } catch (error) {
      try {
        await recordMonitoringEvent({
          level: "warn",
          source: "client-access",
          message:
            error instanceof Error ? error.message : "Creation de cle impossible.",
        });
      } catch {
        // Best-effort monitoring.
      }

      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Creation de cle impossible.",
        },
        {
          status: isChatStorageUnavailableError(error) ? 503 : 400,
        },
      );
    }
  }

  if (action === "validate" || action === "recover") {
    try {
      const result = await validateClientAccessSession({
        ownerId,
        clientKey:
          typeof rawPayload.clientKey === "string" ? rawPayload.clientKey : "",
        securityCode:
          typeof rawPayload.securityCode === "string"
            ? rawPayload.securityCode
            : undefined,
        conversationId:
          typeof rawPayload.conversationId === "string"
            ? rawPayload.conversationId
            : undefined,
      });

      if (!result.valid) {
        try {
          await recordMonitoringEvent({
            level: "warn",
            source: "client-access",
            message: "Validation client echouee.",
          });
        } catch {
          // Best-effort monitoring.
        }

        return NextResponse.json(
          {
            valid: false,
          },
          {
            status: 404,
          },
        );
      }

      return NextResponse.json({
        valid: true,
        session: result.session,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Validation client impossible.",
        },
        {
          status: isChatStorageUnavailableError(error) ? 503 : 400,
        },
      );
    }
  }

  if (action === "secure") {
    try {
      const result = await setClientAccessSecurityCode({
        ownerId,
        clientKey:
          typeof rawPayload.clientKey === "string" ? rawPayload.clientKey : "",
        securityCode:
          typeof rawPayload.securityCode === "string" ? rawPayload.securityCode : "",
      });

      if (!result.saved) {
        return NextResponse.json(
          {
            saved: false,
          },
          {
            status: 404,
          },
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Configuration du code impossible.",
        },
        {
          status: isChatStorageUnavailableError(error) ? 503 : 400,
        },
      );
    }
  }

  return NextResponse.json(
    {
      error: "Action inconnue.",
    },
    {
      status: 400,
    },
  );
}
