import { NextResponse } from "next/server";

import { filterGeneratedReply, generateOwnerSuggestion } from "@/lib/ai";
import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { buildAiConversationContext } from "@/lib/chat/ai-context";
import {
  buildManualAiOwnerInstruction,
  buildManualAiSyntheticClientContext,
  resolveManualAiTask,
} from "@/lib/chat/manual-ai";
import type { ChatConversationRecord, ConversationManualAiTask } from "@/lib/chat/types";
import {
  appendConversationMessage,
  getOwnerConversationState,
  patchConversation,
} from "@/lib/chat/persistence";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { createId } from "@/lib/utils/create-id";

export const runtime = "nodejs";

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

function buildAiContextForManualReply(
  conversation: Pick<ChatConversationRecord, "messages" | "aiConversationSummary">,
  task: ConversationManualAiTask,
  guidance: string,
) {
  const now = getNowIso();
  const baseContext = buildAiConversationContext(conversation);
  const syntheticMessages: Array<{
    id: string;
    sender: "client" | "owner";
    content: string;
    timestamp: string;
  }> = [];
  const syntheticClientContext = buildManualAiSyntheticClientContext(task);

  if (syntheticClientContext) {
    syntheticMessages.push({
      id: `manual-client-${task.id}`,
      sender: "client" as const,
      content: syntheticClientContext,
      timestamp: now,
    });
  }

  syntheticMessages.push({
    id: `manual-owner-${task.id}`,
    sender: "owner" as const,
    content: buildManualAiOwnerInstruction(task, guidance),
    timestamp: now,
  });

  return {
    conversationSummary: baseContext.conversationSummary,
    messages: [...baseContext.messages, ...syntheticMessages],
  };
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      conversationId: string;
      taskId: string;
    }>;
  },
) {
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

  const { conversationId, taskId } = await context.params;
  let rawPayload: unknown = {};

  try {
    rawPayload = await request.json();
  } catch {
    rawPayload = {};
  }

  const payload = isObject(rawPayload) ? rawPayload : {};
  const guidance =
    typeof payload.guidance === "string" ? payload.guidance.trim().slice(0, 2_000) : "";

  if (!conversationId.trim() || !taskId.trim()) {
    return NextResponse.json(
      {
        error: "Contexte de tache invalide.",
      },
      {
        status: 400,
      },
    );
  }

  if (!guidance) {
    return NextResponse.json(
      {
        error: "Le contexte manuel est requis.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const conversation = await getOwnerConversationState(
      DEFAULT_OWNER_ID,
      conversationId,
    );

    if (!conversation) {
      return NextResponse.json(
        {
          error: "Conversation introuvable.",
        },
        {
          status: 404,
        },
      );
    }

    const targetTask = conversation.manualAiTasks.find(
      (task) => task.id === taskId && task.status === "pending",
    );

    if (!targetTask) {
      return NextResponse.json(
        {
          error: "Tache manuelle introuvable.",
        },
        {
          status: 404,
        },
      );
    }

    const lockedConversation = await patchConversation({
      ownerId: DEFAULT_OWNER_ID,
      conversationId,
      autoReplyPending: true,
    });
    const aiContext = buildAiContextForManualReply(
      conversation,
      targetTask,
      guidance,
    );
    const result = await generateOwnerSuggestion({
      conversationId: conversation.id,
      clientName: conversation.clientName,
      aiMode: "auto",
      draft: "",
      conversationSummary: aiContext.conversationSummary,
      conversationSettings: conversation.aiSettings,
      messages: aiContext.messages,
    });
    const filtered = filterGeneratedReply(result.suggestion, {
      conversationId: conversation.id,
      clientName: conversation.clientName,
      aiMode: "auto",
      draft: "",
      conversationSummary: aiContext.conversationSummary,
      conversationSettings: conversation.aiSettings,
      messages: aiContext.messages,
    });
    const aiMessageTimestamp = getNowIso();
    const appendedConversation = await appendConversationMessage({
      ownerId: DEFAULT_OWNER_ID,
      conversationId: conversation.id,
      clientName: conversation.clientName,
      sender: "ai",
      message: {
        id: createId(),
        sender: "ai",
        kind: "text",
        content: filtered.content,
        storageUrl: "",
        mimeType: "",
        fileName: "",
        fileSize: 0,
        durationMs: null,
        transcript: "",
        timestamp: aiMessageTimestamp,
        deliveryStatus: "delivered",
      },
    });
    const finalizedConversation = await patchConversation({
      ownerId: DEFAULT_OWNER_ID,
      conversationId: conversation.id,
      autoReplyPending: false,
      lastAutoReplyToMessageId: targetTask.messageId,
      manualAiTasks: resolveManualAiTask(
        appendedConversation?.manualAiTasks || conversation.manualAiTasks,
        targetTask.id,
        guidance,
        aiMessageTimestamp,
      ),
    });

    return NextResponse.json({
      ok: true,
      reply: filtered.content,
      source: filtered.fallbackApplied ? "fallback" : result.source,
      model: result.model,
      conversation:
        finalizedConversation || appendedConversation || lockedConversation || conversation,
    });
  } catch (error) {
    try {
      await patchConversation({
        ownerId: DEFAULT_OWNER_ID,
        conversationId,
        autoReplyPending: false,
      });
    } catch {
      // Best-effort unlock.
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Reprise manuelle impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
