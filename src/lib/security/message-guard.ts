import "server-only";

import { validateClientAccessSession } from "@/lib/chat/client-access";
import { recordMonitoringEvent } from "@/lib/monitoring/logger";
import { consumeSecurityWindow } from "@/lib/security/rate-limiter";

const MESSAGE_WINDOW_MS = 60 * 1000;
const DUPLICATE_WINDOW_MS = 20 * 1000;
const CLIENT_MESSAGE_LIMIT = 10;
const OWNER_MESSAGE_LIMIT = 36;
const MAX_MESSAGE_LENGTH = 1200;
const MAX_LINKS = 2;

type GuardRole = "client" | "owner";

type GuardInput = {
  role: GuardRole;
  ownerId: string;
  conversationId: string;
  content: string;
  clientKey?: string;
};

type GuardDecision = {
  allowed: boolean;
  status: number;
  reason: string;
  content: string;
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: string;
  };
  clientKeyHash?: string;
};

function normalizeMessageContent(content: string) {
  return content.replace(/\r\n/g, "\n").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function countLinks(content: string) {
  const matches = content.match(/(?:https?:\/\/|www\.)/gi);

  return matches ? matches.length : 0;
}

function hasSpamShape(content: string) {
  return /(.)\1{11,}/.test(content) || /(\b\w+\b)(?:\s+\1){6,}/i.test(content);
}

async function consumeRateLimit(key: string, limit: number) {
  return consumeSecurityWindow({
    scope: "chat-message",
    fingerprint: key,
    limit,
    windowMs: MESSAGE_WINDOW_MS,
  });
}

async function detectDuplicateFlood(key: string) {
  const result = await consumeSecurityWindow({
    scope: "chat-duplicate",
    fingerprint: key,
    limit: 2,
    windowMs: DUPLICATE_WINDOW_MS,
  });

  return !result.allowed;
}

async function logGuardRejection(
  input: GuardInput,
  reason: string,
  status: number,
  clientKeyHash?: string,
) {
  try {
    await recordMonitoringEvent({
      level: status >= 500 ? "error" : "warn",
      source: "message-guard",
      message: reason,
      context: {
        role: input.role,
        ownerId: input.ownerId,
        conversationId: input.conversationId,
        clientKeyHash,
      },
    });
  } catch {
    // Monitoring is best-effort only.
  }
}

function emptyRateLimit(limit = 0) {
  return {
    limit,
    remaining: 0,
    resetAt: new Date().toISOString(),
  };
}

export function getMessageSecurityConfig() {
  return {
    limits: {
      clientPerMinute: CLIENT_MESSAGE_LIMIT,
      ownerPerMinute: OWNER_MESSAGE_LIMIT,
      duplicateWindowSeconds: DUPLICATE_WINDOW_MS / 1000,
      messageMaxLength: MAX_MESSAGE_LENGTH,
      maxLinksPerMessage: MAX_LINKS,
    },
  };
}

export async function validateChatMessageInput(
  input: GuardInput,
): Promise<GuardDecision> {
  const ownerId = input.ownerId.trim();
  const conversationId = input.conversationId.trim();
  const content = normalizeMessageContent(input.content);

  if (!ownerId || !conversationId) {
    await logGuardRejection(input, "Owner ou conversation manquante.", 400);

    return {
      allowed: false,
      status: 400,
      reason: "Owner ou conversation manquante.",
      content: "",
      rateLimit: emptyRateLimit(),
    };
  }

  if (!content) {
    await logGuardRejection(input, "Le message est vide.", 400);

    return {
      allowed: false,
      status: 400,
      reason: "Le message est vide.",
      content: "",
      rateLimit: emptyRateLimit(),
    };
  }

  if (input.content.trim().length > MAX_MESSAGE_LENGTH) {
    await logGuardRejection(input, "Message trop long.", 413);

    return {
      allowed: false,
      status: 413,
      reason: `Message trop long (max ${MAX_MESSAGE_LENGTH} caracteres).`,
      content: "",
      rateLimit: emptyRateLimit(),
    };
  }

  if (countLinks(content) > MAX_LINKS || hasSpamShape(content)) {
    await logGuardRejection(input, "Message detecte comme spam.", 429);

    return {
      allowed: false,
      status: 429,
      reason: "Message detecte comme spam.",
      content: "",
      rateLimit: emptyRateLimit(),
    };
  }

  let clientKeyHash: string | undefined;

  if (input.role === "client") {
    const clientKey = input.clientKey?.trim() || "";

    if (!clientKey) {
      await logGuardRejection(input, "Cle client manquante.", 401);

      return {
        allowed: false,
        status: 401,
        reason: "Cle client manquante.",
        content: "",
        rateLimit: emptyRateLimit(CLIENT_MESSAGE_LIMIT),
      };
    }

    const validation = await validateClientAccessSession({
      ownerId,
      conversationId,
      clientKey,
    });

    if (!validation.valid || !validation.session) {
      await logGuardRejection(input, "Cle client invalide.", 403);

      return {
        allowed: false,
        status: 403,
        reason: "Cle client invalide.",
        content: "",
        rateLimit: emptyRateLimit(CLIENT_MESSAGE_LIMIT),
      };
    }

    clientKeyHash = validation.session.clientKeyHash;
  }

  const actorKey =
    input.role === "client"
      ? `${ownerId}:${clientKeyHash}`
      : `${ownerId}:owner`;
  const rateLimit = await consumeRateLimit(
    `${input.role}:${actorKey}`,
    input.role === "client" ? CLIENT_MESSAGE_LIMIT : OWNER_MESSAGE_LIMIT,
  );

  if (!rateLimit.allowed) {
    await logGuardRejection(
      input,
      "Limite de messages atteinte.",
      429,
      clientKeyHash,
    );

    return {
      allowed: false,
      status: 429,
      reason: "Limite de messages atteinte. Reessaie dans moins d une minute.",
      content: "",
      rateLimit: rateLimit.status,
      clientKeyHash,
    };
  }

  const duplicateKey = `${input.role}:${actorKey}:${conversationId}:${content.toLowerCase()}`;

  if (await detectDuplicateFlood(duplicateKey)) {
    await logGuardRejection(
      input,
      "Message duplique trop rapidement.",
      429,
      clientKeyHash,
    );

    return {
      allowed: false,
      status: 429,
      reason: "Message duplique trop rapidement.",
      content: "",
      rateLimit: rateLimit.status,
      clientKeyHash,
    };
  }

  return {
    allowed: true,
    status: 200,
    reason: "ok",
    content,
    rateLimit: rateLimit.status,
    clientKeyHash,
  };
}
