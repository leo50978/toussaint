import type { ConversationAiSettings } from "@/lib/chat/types";
import type { AiMode, MessageSender } from "@/lib/firestore/schema";

export type AiConversationMessage = {
  id?: string;
  sender: MessageSender;
  content: string;
  timestamp?: string;
};

export type SuggestionRequestInput = {
  conversationId: string;
  clientName: string;
  aiMode?: AiMode;
  draft?: string;
  globalBusinessContext?: string;
  conversationSummary?: string;
  conversationSettings?: ConversationAiSettings;
  messages: AiConversationMessage[];
};

export type SuggestionPromptPayload = {
  systemPrompt: string;
  userPrompt: string;
  messageCount: number;
  totalCharacters: number;
  lastClientMessage: string;
};

export type SuggestionRateLimitStatus = {
  limit: number;
  remaining: number;
  resetAt: string;
};

export type SuggestionSource = "openai" | "fallback";

export type SuggestionResult = {
  suggestion: string;
  model: string;
  source: SuggestionSource;
  rateLimit: SuggestionRateLimitStatus;
  requestId: string;
  promptMetrics: {
    messageCount: number;
    totalCharacters: number;
  };
};

export type SuggestionUsageLogEntry = {
  id: string;
  timestamp: string;
  ownerId: string;
  conversationId: string;
  model: string;
  source: SuggestionSource;
  success: boolean;
  requestCharacters: number;
  responseCharacters: number;
  messageCount: number;
  error?: string;
};
