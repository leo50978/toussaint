import { NextRequest, NextResponse } from "next/server";

import { recordMonitoringEvent } from "@/lib/monitoring/logger";
import { buildRequestFingerprint, consumeSecurityWindow } from "@/lib/security/rate-limiter";

const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 6;
async function consumeClientErrorRateLimit(request: NextRequest) {
  return consumeSecurityWindow({
    scope: "client-error",
    fingerprint: buildRequestFingerprint(request),
    limit: MAX_EVENTS_PER_WINDOW,
    windowMs: WINDOW_MS,
  });
}

function sanitizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await consumeClientErrorRateLimit(request);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: true,
          limited: true,
          rateLimit: rateLimit.status,
        },
        {
          status: 202,
        },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      scope?: unknown;
      message?: unknown;
      digest?: unknown;
      path?: unknown;
    } | null;

    const scope = sanitizeText(body?.scope, "app", 48);
    const message = sanitizeText(body?.message, "Unknown client error", 400);
    const digest = sanitizeText(body?.digest, "", 120);
    const path = sanitizeText(body?.path, "unknown", 200);

    await recordMonitoringEvent({
      level: "error",
      source: `client:${scope}`,
      message,
      context: {
        digest: digest || undefined,
        path,
      },
    });

    return NextResponse.json({
      ok: true,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
      },
      {
        status: 202,
      },
    );
  }
}
