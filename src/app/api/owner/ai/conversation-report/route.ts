import { NextResponse } from "next/server";

import { getOpenAiRuntime } from "@/lib/config/bootstrap";
import { getOwnerProfile } from "@/lib/owner-profile";

export const runtime = "nodejs";

type InputMessage = {
  sender: "client" | "owner" | "ai";
  content: string;
  timestamp: string | undefined;
};

type ReportPayload = {
  conversationId?: string;
  clientName?: string;
  startDateKey?: string;
  endDateKey?: string;
  messages?: InputMessage[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as InputMessage[];
  }

  return value
    .map((message) => {
      if (!isObject(message)) {
        return null;
      }

      const sender = message.sender;
      const content = message.content;

      if (
        (sender !== "client" && sender !== "owner" && sender !== "ai") ||
        typeof content !== "string"
      ) {
        return null;
      }

      return {
        sender,
        content: content.trim().slice(0, 1_200),
        timestamp:
          typeof message.timestamp === "string" ? message.timestamp : undefined,
      } satisfies InputMessage;
    })
    .filter((message): message is InputMessage => Boolean(message && message.content));
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

function buildFallbackAnalysis(
  clientName: string,
  startDateKey: string,
  endDateKey: string,
  messages: InputMessage[],
) {
  const clientMessages = messages.filter((message) => message.sender === "client");
  const ownerMessages = messages.filter(
    (message) => message.sender === "owner" || message.sender === "ai",
  );
  const firstClientMessage = clientMessages[0]?.content || "Aucun message client.";
  const lastClientMessage = clientMessages.at(-1)?.content || "Aucun message client.";
  const lastOwnerMessage =
    ownerMessages.at(-1)?.content || "Aucune reponse envoyee sur la periode.";

  return [
    `Resume IA de la periode ${startDateKey} a ${endDateKey}.`,
    `Client: ${clientName || "Client"}.`,
    `Volume: ${messages.length} messages, dont ${clientMessages.length} messages client et ${ownerMessages.length} reponses cote proprietaire.`,
    `Contexte: la discussion tourne autour de ${lastClientMessage}`,
    `Ce que veut probablement le client: ${lastClientMessage}`,
    `Premier signal client: ${firstClientMessage}`,
    `Derniere reponse envoyee: ${lastOwnerMessage}`,
    "Action conseillee: repondre de facon concrete sur le besoin exprime, clarifier les points encore flous, puis proposer la prochaine etape.",
  ].join("\n\n");
}

async function requestReportAnalysis(
  clientName: string,
  startDateKey: string,
  endDateKey: string,
  messages: InputMessage[],
) {
  const openAiRuntime = getOpenAiRuntime();
  const ownerProfile = await getOwnerProfile();
  const transcript = messages
    .slice(-40)
    .map((message, index) => {
      const label =
        message.sender === "client"
          ? "CLIENT"
          : message.sender === "owner"
            ? "OWNER"
            : "AI";

      return `${index + 1}. ${label}: ${message.content}`;
    })
    .join("\n");

  if (!openAiRuntime.isConfigured) {
    return {
      analysis: buildFallbackAnalysis(clientName, startDateKey, endDateKey, messages),
      source: "fallback" as const,
      model: openAiRuntime.model,
    };
  }

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
                "Tu analyses une conversation client pour le proprietaire. Tu rediges un rapport clair en francais, structure, utile et concret. Explique le contexte, ce que veut le client, ses attentes implicites, son niveau d urgence, ce qui a deja ete repondu, ce qui manque encore, et la meilleure prochaine action. Ne fais pas semblant d avoir des informations absentes.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Proprietaire: ${ownerProfile.displayName} - ${ownerProfile.jobTitle}`,
                `Contexte global: ${ownerProfile.aiBusinessContext || "Aucun contexte specifique."}`,
                `Client: ${clientName || "Client"}`,
                `Periode analysee: du ${startDateKey} au ${endDateKey}`,
                "Historique a analyser:",
                transcript || "Aucun message.",
                "Rends un rapport avec ces parties: 1) Contexte de la discussion 2) Ce que veut vraiment le client 3) Points cles deja couverts 4) Risques ou zones floues 5) Prochaine reponse recommandee.",
              ].join("\n\n"),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("Rapport IA indisponible.");
  }

  const payload = (await response.json()) as unknown;
  const analysis = extractResponseText(payload);

  if (!analysis) {
    throw new Error("Rapport IA indisponible.");
  }

  return {
    analysis: analysis.slice(0, 12_000),
    source: "openai" as const,
    model: openAiRuntime.model,
  };
}

export async function POST(request: Request) {
  let rawPayload: ReportPayload = {};

  try {
    const parsed = await request.json();

    if (isObject(parsed)) {
      rawPayload = parsed as ReportPayload;
    }
  } catch {
    rawPayload = {};
  }

  const conversationId =
    typeof rawPayload.conversationId === "string" ? rawPayload.conversationId.trim() : "";
  const clientName =
    typeof rawPayload.clientName === "string" ? rawPayload.clientName.trim().slice(0, 80) : "";
  const startDateKey =
    typeof rawPayload.startDateKey === "string" ? rawPayload.startDateKey.trim() : "";
  const endDateKey =
    typeof rawPayload.endDateKey === "string" ? rawPayload.endDateKey.trim() : "";
  const messages = normalizeMessages(rawPayload.messages);

  if (!conversationId || !startDateKey || !endDateKey || !messages.length) {
    return NextResponse.json(
      {
        error: "Contexte du rapport incomplet.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await requestReportAnalysis(
      clientName,
      startDateKey,
      endDateKey,
      messages,
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      analysis: buildFallbackAnalysis(clientName, startDateKey, endDateKey, messages),
      source: "fallback",
      model: getOpenAiRuntime().model,
    });
  }
}
