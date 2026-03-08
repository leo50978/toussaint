import { NextResponse } from "next/server";

import {
  getOwnerDraft,
  type DraftEntryRecord,
  updateOwnerDraft,
} from "@/lib/drafts";
import { getOpenAiRuntime } from "@/lib/config/bootstrap";
import { createId } from "@/lib/utils/create-id";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

function buildEntry(role: DraftEntryRecord["role"], content: string): DraftEntryRecord {
  const now = new Date().toISOString();

  return {
    id: createId(),
    role,
    content: content.trim().slice(0, 20_000),
    createdAt: now,
    updatedAt: now,
  };
}

function buildFallbackAssistantReply(message: string) {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return "Je suis pret. Donne-moi une tache ou un texte a travailler.";
  }

  return `J ai bien note ta demande: ${normalizedMessage}. Detaille ce que tu veux produire et je peux t aider a structurer, rediger, corriger ou decouper le travail.`;
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidate = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };

  if (typeof candidate.output_text === "string" && candidate.output_text.trim()) {
    return candidate.output_text.trim();
  }

  if (!Array.isArray(candidate.output)) {
    return "";
  }

  return candidate.output
    .flatMap((item) => item.content || [])
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function requestAssistantReply(
  entries: DraftEntryRecord[],
  title: string,
  message: string,
) {
  const openAiRuntime = getOpenAiRuntime();

  if (!openAiRuntime.isConfigured) {
    return {
      content: buildFallbackAssistantReply(message),
      source: "fallback" as const,
      model: openAiRuntime.model,
    };
  }

  const transcript = entries
    .slice(-20)
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.role === "assistant" ? "ASSISTANT" : "OWNER"}: ${entry.content}`,
    )
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiRuntime.apiKey}`,
    },
    body: JSON.stringify({
      model: openAiRuntime.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Tu es l assistant de travail prive du proprietaire. Tu peux brainstormer, organiser, rediger, reformuler, planifier, proposer des pistes techniques et aider librement sur ses projets. Reponds dans la langue du dernier message. Donne une reponse utile, concrete et exploitable.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Nom du brouillon: ${title || "Brouillon prive"}`,
                "Historique recent du brouillon:",
                transcript || "Aucun contenu precedent.",
                `Derniere tache ou note du proprietaire: ${message}`,
              ].join("\n\n"),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("Assistant IA indisponible.");
  }

  const payload = (await response.json()) as unknown;
  const content = extractResponseText(payload);

  if (!content) {
    throw new Error("Assistant IA indisponible.");
  }

  return {
    content: content.slice(0, 8_000),
    source: "openai" as const,
    model: openAiRuntime.model,
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { draftId } = await context.params;
  let message = "";

  try {
    const rawPayload = (await request.json()) as {
      message?: unknown;
    };

    if (typeof rawPayload.message === "string") {
      message = rawPayload.message;
    }
  } catch {
    message = "";
  }

  const normalizedMessage = message.trim().slice(0, 8_000);

  if (!normalizedMessage) {
    return NextResponse.json(
      {
        error: "Message vide.",
      },
      {
        status: 400,
      },
    );
  }

  const draft = await getOwnerDraft(draftId);

  if (!draft) {
    return NextResponse.json(
      {
        error: "Brouillon introuvable.",
      },
      {
        status: 404,
      },
    );
  }

  const ownerEntry = buildEntry("owner", normalizedMessage);
  const entriesWithOwnerMessage = [...draft.entries, ownerEntry];

  let assistantReply = buildFallbackAssistantReply(normalizedMessage);
  let source: "openai" | "fallback" = "fallback";
  let model = getOpenAiRuntime().model;

  try {
    const result = await requestAssistantReply(
      entriesWithOwnerMessage,
      draft.title,
      normalizedMessage,
    );

    assistantReply = result.content;
    source = result.source;
    model = result.model;
  } catch {
    assistantReply = buildFallbackAssistantReply(normalizedMessage);
  }

  const assistantEntry = buildEntry("assistant", assistantReply);
  const result = await updateOwnerDraft(draftId, {
    title: draft.title,
    content: draft.content,
    tags: draft.tags,
    isPinned: draft.isPinned,
    entries: [...entriesWithOwnerMessage, assistantEntry],
    aiAssistantEnabled: true,
  });

  if (!result) {
    return NextResponse.json(
      {
        error: "Mise a jour du brouillon impossible.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    ...result,
    source,
    model,
  });
}
