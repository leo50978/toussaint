import { NextResponse } from "next/server";

import {
  buildEmergencyAutoReply,
  filterGeneratedReply,
  generateOwnerSuggestion,
  isAutoReplyActive,
  type SuggestionRequestInput,
} from "@/lib/ai";
import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { buildAiConversationContext } from "@/lib/chat/ai-context";
import { validateClientAccessSession } from "@/lib/chat/client-access";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import {
  createManualAiTask,
  findTriggeredAttentionKeyword,
  getPendingManualAiTasks,
  upsertPendingManualAiTask,
} from "@/lib/chat/manual-ai";
import {
  appendConversationMessage,
  getClientConversationState,
  patchConversation,
} from "@/lib/chat/persistence";
import type { ChatMessageReplyReference } from "@/lib/chat/types";
import { getOpenAiRuntime } from "@/lib/config/bootstrap";
import { recordMonitoringEvent } from "@/lib/monitoring/logger";
import { getOwnerProfile } from "@/lib/owner-profile";
import { buildRequestFingerprint, consumeSecurityWindow } from "@/lib/security/rate-limiter";
import { createId } from "@/lib/utils/create-id";

export const runtime = "nodejs";
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 16;
const autoReplyLocks = new Set<string>();
const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

function getNowIso() {
  return new Date().toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSender(
  value: unknown,
): SuggestionRequestInput["messages"][number]["sender"] {
  if (value === "owner" || value === "ai" || value === "client") {
    return value;
  }

  return "client";
}

function normalizeMessageId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 120);
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

function normalizeActor(value: unknown) {
  if (value === "owner") {
    return "owner" as const;
  }

  if (value === "client") {
    return "client" as const;
  }

  return null;
}

async function consumeAutoReplySlot(request: Request, conversationId: string) {
  return consumeSecurityWindow({
    scope: "chat-auto-reply",
    fingerprint: buildRequestFingerprint(request, [conversationId]),
    limit: MAX_REQUESTS_PER_WINDOW,
    windowMs: RATE_WINDOW_MS,
  });
}

function buildAutoReplyLockKey(conversationId: string, messageId: string) {
  return `${conversationId.trim()}:${messageId.trim()}`;
}

function acquireAutoReplyLock(conversationId: string, messageId: string) {
  const lockKey = buildAutoReplyLockKey(conversationId, messageId);

  if (autoReplyLocks.has(lockKey)) {
    return null;
  }

  autoReplyLocks.add(lockKey);
  return lockKey;
}

function releaseAutoReplyLock(lockKey: string | null) {
  if (!lockKey) {
    return;
  }

  autoReplyLocks.delete(lockKey);
}

function buildPersistedAutoReplyMessage(content: string) {
  return {
    id: createId(),
    sender: "ai" as const,
    kind: "text" as const,
    content,
    storageUrl: "",
    mimeType: "",
    fileName: "",
    fileSize: 0,
    durationMs: null,
    transcript: "",
    timestamp: getNowIso(),
    deliveryStatus: "delivered" as const,
    replyTo: null,
  };
}

async function finalizeAutoReplyConversation(
  ownerId: string,
  conversationId: string,
  clientName: string,
  triggeringMessageId: string,
  content: string,
  replyTo?: ChatMessageReplyReference,
) {
  const appendedConversation = content
    ? await appendConversationMessage({
        ownerId,
        conversationId,
        clientName,
        sender: "ai",
        message: {
          ...buildPersistedAutoReplyMessage(content),
          replyTo: replyTo || null,
        },
      })
    : null;

  const finalizedConversation = await patchConversation({
    ownerId,
    conversationId,
    autoReplyPending: false,
    lastAutoReplyToMessageId: triggeringMessageId,
  });

  return finalizedConversation || appendedConversation;
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
    aiMode: "auto",
    draft: "",
    conversationSummary:
      typeof rawPayload.conversationSummary === "string"
        ? rawPayload.conversationSummary
        : "",
    conversationSettings: normalizeConversationSettings(rawPayload.conversationSettings),
    messages: Array.isArray(rawPayload.messages)
      ? rawPayload.messages.map((message) => ({
          id: normalizeMessageId(isObject(message) ? message.id : undefined),
          sender: normalizeSender(isObject(message) ? message.sender : undefined),
          content:
            isObject(message) && typeof message.content === "string"
              ? message.content
              : "",
          timestamp:
            isObject(message) && typeof message.timestamp === "string"
              ? message.timestamp
              : undefined,
        }))
      : [],
  };
  const ownerId = typeof rawPayload.ownerId === "string" ? rawPayload.ownerId.trim() : "";
  const securityCode =
    typeof rawPayload.securityCode === "string" ? rawPayload.securityCode : "";
  const actor = normalizeActor(rawPayload.actor);
  const clientKey =
    typeof rawPayload.clientKey === "string" ? rawPayload.clientKey.trim() : "";

  const lastMessage = payload.messages.at(-1);
  const triggeringMessageId = lastMessage?.id || "";

  if (
    !payload.conversationId ||
    !payload.clientName ||
    !payload.messages.length ||
    !ownerId
  ) {
    return NextResponse.json(
      {
        error: "Contexte de conversation incomplet.",
      },
      {
        status: 400,
      },
    );
  }

  if (!triggeringMessageId) {
    return NextResponse.json(
      {
        error: "Message client declencheur introuvable.",
      },
      {
        status: 400,
      },
    );
  }

  if (ownerId !== DEFAULT_OWNER_ID) {
    return NextResponse.json(
      {
        error: "Owner invalide.",
      },
      {
        status: 403,
      },
    );
  }

  const rateLimit = await consumeAutoReplySlot(request, payload.conversationId);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Trop de requetes IA sur cette discussion. Reessaie bientot.",
        rateLimit: rateLimit.status,
      },
      {
        status: 429,
      },
    );
  }

  if (actor === "owner") {
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
  } else {
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

    let validation;

    try {
      validation = await validateClientAccessSession({
        ownerId,
        conversationId: payload.conversationId,
        clientKey,
        securityCode,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Validation client impossible.",
        },
        {
          status: isChatStorageUnavailableError(error) ? 503 : 500,
        },
      );
    }

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

  if (!lastMessage || lastMessage.sender !== "client") {
    return NextResponse.json(
      {
        error: "Aucun nouveau message client a traiter.",
      },
      {
        status: 400,
      },
    );
  }

  let persistedConversation;

  try {
    persistedConversation = await getClientConversationState(
      ownerId,
      payload.conversationId,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Lecture de conversation impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }

  if (!persistedConversation) {
    return NextResponse.json(
      {
        error: "Conversation introuvable.",
      },
      {
        status: 404,
      },
    );
  }

  const persistedLastMessage = persistedConversation.messages.at(-1);
  const persistedAiContext = buildAiConversationContext(persistedConversation);
  payload.clientName = persistedConversation.clientName;
  payload.conversationSettings = persistedConversation.aiSettings;
  payload.conversationSummary = persistedAiContext.conversationSummary;
  payload.messages = persistedAiContext.messages;

  if (
    persistedConversation.aiMode !== "auto" ||
    persistedConversation.status !== "active" ||
    !persistedLastMessage ||
    persistedLastMessage.sender !== "client" ||
    persistedLastMessage.id !== triggeringMessageId
  ) {
    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "stale-trigger",
      conversation: persistedConversation,
    });
  }

  const ownerProfile = await getOwnerProfile().catch(() => null);
  const matchedAttentionKeyword = findTriggeredAttentionKeyword(
    persistedLastMessage,
    ownerProfile?.aiAttentionKeywords || [],
  );
  const existingPendingManualTasks = getPendingManualAiTasks(
    persistedConversation.manualAiTasks || [],
  );
  const existingTaskForMessage = existingPendingManualTasks.find(
    (task) => task.messageId === triggeringMessageId,
  );
  const requiresManualReview =
    persistedLastMessage.kind !== "text" || Boolean(matchedAttentionKeyword);

  if (requiresManualReview && !existingTaskForMessage) {
    const manualTask = createManualAiTask(persistedLastMessage, {
      keyword: matchedAttentionKeyword,
      createdAt: getNowIso(),
    });
    const updatedConversation = await patchConversation({
      ownerId,
      conversationId: payload.conversationId,
      manualAiTasks: upsertPendingManualAiTask(
        persistedConversation.manualAiTasks || [],
        manualTask,
      ),
      autoReplyPending: false,
      lastAutoReplyToMessageId: triggeringMessageId,
    });

    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "manual-review-required",
      conversation: updatedConversation || persistedConversation,
    });
  }

  if (existingPendingManualTasks.length > 0) {
    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "manual-review-pending",
      conversation: persistedConversation,
    });
  }

  if (persistedConversation.lastAutoReplyToMessageId === triggeringMessageId) {
    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "already-processed",
      conversation: persistedConversation,
    });
  }

  if (persistedConversation.autoReplyPending) {
    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "already-pending",
      conversation: persistedConversation,
    });
  }

  if (!isAutoReplyActive(payload)) {
    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "outside-schedule",
      conversation: persistedConversation,
    });
  }

  const autoReplyLockKey = acquireAutoReplyLock(
    payload.conversationId,
    triggeringMessageId,
  );

  if (!autoReplyLockKey) {
    return NextResponse.json({
      reply: "",
      source: "schedule",
      requestId: createId(),
      suppressed: true,
      reason: "lock-active",
      conversation: persistedConversation,
    });
  }

  try {
    const lockedConversation = await patchConversation({
      ownerId,
      conversationId: payload.conversationId,
      autoReplyPending: true,
    });
    const result = await generateOwnerSuggestion(payload);
    const filtered = filterGeneratedReply(result.suggestion, payload);
    const finalizedConversation = await finalizeAutoReplyConversation(
      ownerId,
      payload.conversationId,
      payload.clientName,
      triggeringMessageId,
      filtered.content,
      lastMessage
        ? {
            messageId: lastMessage.id || "",
            sender: lastMessage.sender,
            kind: "text",
            content: lastMessage.content.slice(0, 240),
            fileName: "",
            timestamp: lastMessage.timestamp || getNowIso(),
          }
        : undefined,
    );

    return NextResponse.json({
      reply: filtered.content,
      source: filtered.fallbackApplied ? "fallback" : result.source,
      model: result.model,
      requestId: result.requestId,
      wasFiltered: filtered.wasFiltered,
      fallbackApplied: filtered.fallbackApplied,
      conversation:
        finalizedConversation || lockedConversation || persistedConversation,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Auto-reponse impossible.";

    if (isChatStorageUnavailableError(error)) {
      return NextResponse.json(
        {
          error: errorMessage,
        },
        {
          status: 503,
        },
      );
    }

    const filtered = filterGeneratedReply(
      buildEmergencyAutoReply(payload),
      payload,
    );
    const finalizedConversation = await finalizeAutoReplyConversation(
      ownerId,
      payload.conversationId,
      payload.clientName,
      triggeringMessageId,
      filtered.content,
    );
    const message =
      errorMessage;

    try {
      await recordMonitoringEvent({
        level: "warn",
        source: "chat-auto-reply",
        message,
        context: {
          conversationId: payload.conversationId,
        },
      });
    } catch {
      // Best-effort monitoring.
    }

    return NextResponse.json({
      reply: filtered.content,
      source: "fallback",
      model: getOpenAiRuntime().model,
      requestId: createId(),
      wasFiltered: filtered.wasFiltered,
      fallbackApplied: true,
      error: message,
      conversation: finalizedConversation || persistedConversation,
    });
  } finally {
    releaseAutoReplyLock(autoReplyLockKey);
  }
}
