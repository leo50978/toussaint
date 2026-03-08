import { NextResponse } from "next/server";

import { filterGeneratedReply, generateOwnerSuggestion, type SuggestionRequestInput } from "@/lib/ai";
import { recordMonitoringEvent } from "@/lib/monitoring/logger";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAiMode(value: unknown): value is SuggestionRequestInput["aiMode"] {
  return value === "auto" || value === "suggestion" || value === "off";
}

function normalizeSender(
  value: unknown,
): SuggestionRequestInput["messages"][number]["sender"] {
  if (value === "owner" || value === "ai" || value === "client") {
    return value;
  }

  return "client";
}

function normalizeConversationSettings(
  value: unknown,
): SuggestionRequestInput["conversationSettings"] {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    tone: typeof value.tone === "string" ? value.tone : "",
    personalContext:
      typeof value.personalContext === "string" ? value.personalContext : "",
    maxLength: typeof value.maxLength === "number" ? value.maxLength : 320,
    blacklistWords: Array.isArray(value.blacklistWords)
      ? value.blacklistWords.filter((word): word is string => typeof word === "string")
      : [],
    scheduleEnabled: Boolean(value.scheduleEnabled),
    scheduleStart: typeof value.scheduleStart === "string" ? value.scheduleStart : "08:00",
    scheduleEnd: typeof value.scheduleEnd === "string" ? value.scheduleEnd : "20:00",
    scheduleTimezone:
      typeof value.scheduleTimezone === "string" ? value.scheduleTimezone : "UTC",
  };
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

  const payload: SuggestionRequestInput = {
    conversationId:
      typeof rawPayload.conversationId === "string" ? rawPayload.conversationId : "",
    clientName: typeof rawPayload.clientName === "string" ? rawPayload.clientName : "",
    aiMode: isAiMode(rawPayload.aiMode) ? rawPayload.aiMode : undefined,
    draft: typeof rawPayload.draft === "string" ? rawPayload.draft : "",
    conversationSummary:
      typeof rawPayload.conversationSummary === "string"
        ? rawPayload.conversationSummary
        : "",
    conversationSettings: normalizeConversationSettings(rawPayload.conversationSettings),
    messages: Array.isArray(rawPayload.messages)
      ? rawPayload.messages.map((message) => ({
          sender: normalizeSender(isObject(message) ? message.sender : undefined),
          content: isObject(message) && typeof message.content === "string"
            ? message.content
            : "",
          timestamp:
            isObject(message) && typeof message.timestamp === "string"
              ? message.timestamp
              : undefined,
        }))
      : [],
  };

  try {
    const result = await generateOwnerSuggestion(payload);
    const filtered = filterGeneratedReply(result.suggestion, payload);

    return NextResponse.json({
      ...result,
      suggestion: filtered.content,
      source: filtered.fallbackApplied ? "fallback" : result.source,
      filtered: filtered.wasFiltered,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation IA impossible.";
    const status =
      error instanceof Error &&
      (error as Error & { code?: string }).code === "RATE_LIMIT"
        ? 429
        : 400;

    try {
      await recordMonitoringEvent({
        level: status >= 500 ? "error" : "warn",
        source: "owner-ai-suggest",
        message,
        context: {
          conversationId: payload.conversationId,
          aiMode: payload.aiMode,
        },
      });
    } catch {
      // Best-effort monitoring.
    }

    return NextResponse.json(
      {
        error: message,
      },
      {
        status,
      },
    );
  }
}
