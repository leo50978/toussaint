import type { AiConversationMessage } from "@/lib/ai/types";

import type { ChatConversationRecord, ChatMessageRecord } from "./types";

const AI_RECENT_MESSAGE_WINDOW = 18;
const AI_SUMMARY_MAX_LINES = 10;
const AI_SUMMARY_MAX_CHARACTERS = 1_400;
const AI_SUMMARY_MESSAGE_SNIPPET_LENGTH = 140;

function normalizeMessageContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getTextMessages(messages: ChatMessageRecord[]) {
  return messages.flatMap((message) => {
    if (message.kind !== "text") {
      return [];
    }

    const content = normalizeMessageContent(message.content);

    if (!content) {
      return [];
    }

    return [
      {
        id: message.id,
        sender: message.sender,
        content,
        timestamp: message.timestamp,
      } satisfies AiConversationMessage,
    ];
  });
}

function getSenderLabel(sender: AiConversationMessage["sender"]) {
  if (sender === "client") {
    return "Client";
  }

  if (sender === "owner") {
    return "Owner";
  }

  return "IA";
}

export function buildConversationAiSummaryFromMessages(
  messages: ChatMessageRecord[],
) {
  const textMessages = getTextMessages(messages);

  if (textMessages.length <= AI_RECENT_MESSAGE_WINDOW) {
    return "";
  }

  const historicalMessages = textMessages.slice(0, -AI_RECENT_MESSAGE_WINDOW);
  const selectedMessages = historicalMessages.slice(-AI_SUMMARY_MAX_LINES);
  const summaryLines = selectedMessages.map((message, index) => {
    return `${index + 1}. ${getSenderLabel(message.sender)}: ${truncate(
      message.content,
      AI_SUMMARY_MESSAGE_SNIPPET_LENGTH,
    )}`;
  });

  const firstTimestamp = historicalMessages[0]?.timestamp || "";
  const lastTimestamp = historicalMessages.at(-1)?.timestamp || "";
  const header = `Resume compact des echanges precedents (${historicalMessages.length} messages avant la fenetre recente${
    firstTimestamp && lastTimestamp ? `, de ${firstTimestamp} a ${lastTimestamp}` : ""
  }).`;

  return truncate(
    [header, ...summaryLines].filter(Boolean).join("\n"),
    AI_SUMMARY_MAX_CHARACTERS,
  );
}

export function buildAiConversationContext(
  conversation: Pick<ChatConversationRecord, "messages" | "aiConversationSummary">,
) {
  const textMessages = getTextMessages(conversation.messages);

  return {
    conversationSummary:
      normalizeMessageContent(conversation.aiConversationSummary || "") ||
      buildConversationAiSummaryFromMessages(conversation.messages),
    messages: textMessages.slice(-AI_RECENT_MESSAGE_WINDOW),
  };
}
