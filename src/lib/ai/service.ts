import "server-only";

import { getOpenAiRuntime } from "@/lib/config/bootstrap";
import { getOwnerProfile } from "@/lib/owner-profile";
import { createId } from "@/lib/utils/create-id";

import { appendSuggestionUsageLog } from "./logs";
import { buildBaseFallbackReply, buildFallbackSuggestion, buildSuggestionPrompt } from "./prompt";
import { consumeSuggestionRequestSlot } from "./rate-limit";
import type { SuggestionRequestInput, SuggestionResult, SuggestionUsageLogEntry } from "./types";

const DEFAULT_REPLY_MAX_CHARACTERS = 320;
const MAX_REPLY_MAX_CHARACTERS = 600;
const MIN_REPLY_MAX_CHARACTERS = 80;

function getOwnerWorkspaceId() {
  return (
    process.env.OWNER_WORKSPACE_ID ||
    process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
    "vichly-owner"
  );
}

function getConfiguredBlacklistWords() {
  const rawValue = process.env.OWNER_AI_BLACKLIST_WORDS || "";

  return rawValue
    .split(/[,;\n]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 24);
}

function getEffectiveBlacklistWords(
  input: Pick<SuggestionRequestInput, "conversationSettings">,
) {
  const conversationWords = Array.isArray(input.conversationSettings?.blacklistWords)
    ? input.conversationSettings?.blacklistWords
    : [];

  return [...new Set(
    [...getConfiguredBlacklistWords(), ...conversationWords]
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  )].slice(0, 24);
}

function getEffectiveReplyMaxLength(
  input: Pick<SuggestionRequestInput, "conversationSettings">,
) {
  const configuredLength = input.conversationSettings?.maxLength;

  if (
    typeof configuredLength === "number" &&
    Number.isFinite(configuredLength)
  ) {
    return Math.min(
      Math.max(Math.round(configuredLength), MIN_REPLY_MAX_CHARACTERS),
      MAX_REPLY_MAX_CHARACTERS,
    );
  }

  return DEFAULT_REPLY_MAX_CHARACTERS;
}

function normalizeGeneratedContent(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildEmergencyAutoReply(
  input: Pick<SuggestionRequestInput, "clientName" | "messages">,
) {
  return buildBaseFallbackReply(input);
}

function parseTimeToMinutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map((segment) => Number(segment));

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function getCurrentMinutesInTimeZone(timeZone: string, now: Date) {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hours = Number(parts.find((part) => part.type === "hour")?.value || "0");
    const minutes = Number(
      parts.find((part) => part.type === "minute")?.value || "0",
    );

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return hours * 60 + minutes;
  } catch {
    return null;
  }
}

export function isAutoReplyActive(
  input: Pick<SuggestionRequestInput, "conversationSettings">,
) {
  const settings = input.conversationSettings;

  if (!settings?.scheduleEnabled) {
    return true;
  }

  const startMinutes = parseTimeToMinutes(settings.scheduleStart);
  const endMinutes = parseTimeToMinutes(settings.scheduleEnd);

  if (
    startMinutes === null ||
    endMinutes === null ||
    settings.scheduleStart === settings.scheduleEnd
  ) {
    return true;
  }

  const currentMinutes = getCurrentMinutesInTimeZone(
    settings.scheduleTimezone || "UTC",
    new Date(),
  );

  if (currentMinutes === null) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function filterGeneratedReply(
  content: string,
  input: Pick<
    SuggestionRequestInput,
    "clientName" | "conversationSettings" | "messages"
  >,
) {
  const normalizedContent = normalizeGeneratedContent(
    content,
    getEffectiveReplyMaxLength(input),
  );
  const blacklistWords = getEffectiveBlacklistWords(input);
  const lowerContent = normalizedContent.toLowerCase();
  const containsBlockedWord = blacklistWords.some((word) => lowerContent.includes(word));

  if (!normalizedContent || containsBlockedWord) {
    return {
      content: buildEmergencyAutoReply(input),
      wasFiltered: true,
      fallbackApplied: true,
    };
  }

  return {
    content: normalizedContent,
    wasFiltered: normalizedContent !== content.trim(),
    fallbackApplied: false,
  };
}

function isAllowedSender(sender: string) {
  return sender === "client" || sender === "owner" || sender === "ai";
}

function normalizeRequest(input: SuggestionRequestInput): SuggestionRequestInput {
  const normalizedConversationSettings = input.conversationSettings
    ? {
        tone:
          typeof input.conversationSettings.tone === "string"
            ? input.conversationSettings.tone.trim().slice(0, 160)
            : "",
        personalContext:
          typeof input.conversationSettings.personalContext === "string"
            ? input.conversationSettings.personalContext.trim().slice(0, 1_500)
            : "",
        maxLength:
          typeof input.conversationSettings.maxLength === "number" &&
          Number.isFinite(input.conversationSettings.maxLength)
            ? Math.min(
                Math.max(Math.round(input.conversationSettings.maxLength), 80),
                600,
              )
            : 320,
        blacklistWords: Array.isArray(input.conversationSettings.blacklistWords)
          ? input.conversationSettings.blacklistWords
              .filter((word): word is string => typeof word === "string")
              .map((word) => word.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 20)
          : [],
        scheduleEnabled: Boolean(input.conversationSettings.scheduleEnabled),
        scheduleStart:
          typeof input.conversationSettings.scheduleStart === "string"
            ? input.conversationSettings.scheduleStart
            : "08:00",
        scheduleEnd:
          typeof input.conversationSettings.scheduleEnd === "string"
            ? input.conversationSettings.scheduleEnd
            : "20:00",
        scheduleTimezone:
          typeof input.conversationSettings.scheduleTimezone === "string"
            ? input.conversationSettings.scheduleTimezone.trim().slice(0, 80)
            : "UTC",
      }
    : undefined;

  return {
    conversationId: input.conversationId.trim(),
    clientName: input.clientName.trim().slice(0, 80),
    aiMode: input.aiMode,
    draft: input.draft?.trim().slice(0, 500),
    globalBusinessContext: input.globalBusinessContext?.trim().slice(0, 2_000),
    conversationSummary: input.conversationSummary?.trim().slice(0, 1_400),
    conversationSettings: normalizedConversationSettings,
    messages: Array.isArray(input.messages)
      ? input.messages
          .filter(
            (message) =>
              message &&
              typeof message.sender === "string" &&
              isAllowedSender(message.sender) &&
              typeof message.content === "string",
          )
          .map((message) => ({
            sender: message.sender,
            content: message.content.trim(),
            timestamp: message.timestamp,
          }))
          .filter((message) => Boolean(message.content))
      : [],
  };
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

  const collectedText = candidate.output
    .flatMap((item) => item.content || [])
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return collectedText;
}

async function requestOpenAiSuggestion(
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
) {
  const runtime = getOpenAiRuntime();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.apiKey}`,
    },
    body: JSON.stringify({
      model: runtime.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const rawError = await response.text();
    const normalizedError = rawError.trim().slice(0, 240) || response.statusText;

    throw new Error(`OpenAI ${response.status}: ${normalizedError}`);
  }

  const payload = (await response.json()) as unknown;
  const suggestion = extractResponseText(payload);

  if (!suggestion) {
    throw new Error("OpenAI n a retourne aucun texte exploitable.");
  }

  return {
    suggestion,
    model: runtime.model,
  };
}

async function logSuggestionAttempt(entry: SuggestionUsageLogEntry) {
  try {
    await appendSuggestionUsageLog(entry);
  } catch {
    // Logging must not block the response path.
  }
}

export async function generateOwnerSuggestion(
  input: SuggestionRequestInput,
): Promise<SuggestionResult> {
  const ownerId = getOwnerWorkspaceId();
  const requestId = createId();
  let ownerProfileContext = "";

  try {
    const ownerProfile = await getOwnerProfile();
    ownerProfileContext = ownerProfile.aiBusinessContext || "";
  } catch {
    ownerProfileContext = "";
  }

  const normalizedInput = normalizeRequest({
    ...input,
    globalBusinessContext: input.globalBusinessContext || ownerProfileContext,
  });

  if (!normalizedInput.conversationId) {
    throw new Error("Conversation invalide.");
  }

  if (!normalizedInput.clientName) {
    throw new Error("Nom client manquant.");
  }

  if (!normalizedInput.messages.length) {
    throw new Error("Aucun historique disponible pour generer une suggestion.");
  }

  const rateLimit = await consumeSuggestionRequestSlot(ownerId);

  if (!rateLimit.allowed) {
    await logSuggestionAttempt({
      id: requestId,
      timestamp: new Date().toISOString(),
      ownerId,
      conversationId: normalizedInput.conversationId,
      model: getOpenAiRuntime().model,
      source: "fallback",
      success: false,
      requestCharacters: 0,
      responseCharacters: 0,
      messageCount: normalizedInput.messages.length,
      error: "Rate limit exceeded",
    });

    const error = new Error("Limite de requetes IA atteinte. Reessaie dans moins d une minute.");
    (error as Error & { code?: string }).code = "RATE_LIMIT";
    throw error;
  }

  const prompt = buildSuggestionPrompt(normalizedInput);
  const runtime = getOpenAiRuntime();

  if (!runtime.isConfigured) {
    const suggestion = buildFallbackSuggestion(normalizedInput);

    await logSuggestionAttempt({
      id: requestId,
      timestamp: new Date().toISOString(),
      ownerId,
      conversationId: normalizedInput.conversationId,
      model: runtime.model,
      source: "fallback",
      success: true,
      requestCharacters: prompt.totalCharacters,
      responseCharacters: suggestion.length,
      messageCount: prompt.messageCount,
    });

    return {
      suggestion,
      model: runtime.model,
      source: "fallback",
      rateLimit: rateLimit.status,
      requestId,
      promptMetrics: {
        messageCount: prompt.messageCount,
        totalCharacters: prompt.totalCharacters,
      },
    };
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, 10_000);

  try {
    const result = await requestOpenAiSuggestion(
      prompt.systemPrompt,
      prompt.userPrompt,
      timeoutController.signal,
    );

    await logSuggestionAttempt({
      id: requestId,
      timestamp: new Date().toISOString(),
      ownerId,
      conversationId: normalizedInput.conversationId,
      model: result.model,
      source: "openai",
      success: true,
      requestCharacters: prompt.totalCharacters,
      responseCharacters: result.suggestion.length,
      messageCount: prompt.messageCount,
    });

    return {
      suggestion: result.suggestion,
      model: result.model,
      source: "openai",
      rateLimit: rateLimit.status,
      requestId,
      promptMetrics: {
        messageCount: prompt.messageCount,
        totalCharacters: prompt.totalCharacters,
      },
    };
  } catch (error) {
    const suggestion = buildFallbackSuggestion(normalizedInput);
    const errorMessage =
      error instanceof Error ? error.message : "Erreur IA inconnue.";

    await logSuggestionAttempt({
      id: requestId,
      timestamp: new Date().toISOString(),
      ownerId,
      conversationId: normalizedInput.conversationId,
      model: runtime.model,
      source: "fallback",
      success: false,
      requestCharacters: prompt.totalCharacters,
      responseCharacters: suggestion.length,
      messageCount: prompt.messageCount,
      error: errorMessage,
    });

    return {
      suggestion,
      model: runtime.model,
      source: "fallback",
      rateLimit: rateLimit.status,
      requestId,
      promptMetrics: {
        messageCount: prompt.messageCount,
        totalCharacters: prompt.totalCharacters,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
