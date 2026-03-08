import "server-only";

import { consumeSecurityWindow } from "@/lib/security/rate-limiter";

import type { SuggestionRateLimitStatus } from "./types";

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;

export function getSuggestionRateLimitConfig() {
  return {
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS_PER_WINDOW,
  };
}

export async function consumeSuggestionRequestSlot(ownerId: string): Promise<{
  allowed: boolean;
  status: SuggestionRateLimitStatus;
}> {
  const result = await consumeSecurityWindow({
    scope: "owner-ai-suggest",
    fingerprint: ownerId.trim(),
    limit: MAX_REQUESTS_PER_WINDOW,
    windowMs: WINDOW_MS,
  });

  return {
    allowed: result.allowed,
    status: result.status,
  };
}
