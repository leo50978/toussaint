import type { ChatMessageRecord, ConversationManualAiTask } from "@/lib/chat/types";

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeAttentionKeywords(keywords: string[]) {
  return [...new Set(keywords.map(normalizeKeyword).filter(Boolean))].slice(0, 40);
}

export function getManualAiMessageKindLabel(kind: ChatMessageRecord["kind"]) {
  if (kind === "voice") {
    return "message vocal";
  }

  if (kind === "image") {
    return "image";
  }

  if (kind === "video") {
    return "video";
  }

  if (kind === "file") {
    return "fichier";
  }

  return "message";
}

export function findTriggeredAttentionKeyword(
  message: Pick<ChatMessageRecord, "kind" | "content">,
  keywords: string[],
) {
  if (message.kind !== "text") {
    return "";
  }

  const normalizedContent = message.content.trim().toLowerCase();

  if (!normalizedContent) {
    return "";
  }

  return normalizeAttentionKeywords(keywords).find((keyword) =>
    normalizedContent.includes(keyword),
  ) || "";
}

export function createManualAiTask(
  message: Pick<ChatMessageRecord, "id" | "kind">,
  options?: {
    keyword?: string;
    createdAt?: string;
  },
): ConversationManualAiTask {
  const reason = message.kind === "text" ? "keyword" : "media";

  return {
    id: `manual-ai-${message.id}`,
    messageId: message.id,
    messageKind: message.kind,
    reason,
    keyword: options?.keyword?.trim().toLowerCase().slice(0, 80) || "",
    ownerGuidance: "",
    status: "pending",
    createdAt: options?.createdAt || new Date().toISOString(),
    resolvedAt: null,
  };
}

export function upsertPendingManualAiTask(
  tasks: ConversationManualAiTask[],
  task: ConversationManualAiTask,
) {
  const otherTasks = tasks.filter((entry) => entry.id !== task.id);
  return [...otherTasks, task].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export function resolveManualAiTask(
  tasks: ConversationManualAiTask[],
  taskId: string,
  guidance: string,
  resolvedAt: string,
): ConversationManualAiTask[] {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          ownerGuidance: guidance.trim().slice(0, 2_000),
          status: "resolved" as const,
          resolvedAt,
        }
      : task,
  );
}

export function getPendingManualAiTasks(tasks: ConversationManualAiTask[]) {
  return tasks.filter((task) => task.status === "pending");
}

export function buildManualAiOwnerInstruction(
  task: ConversationManualAiTask,
  guidance: string,
) {
  const trimmedGuidance = guidance.trim();
  const targetLabel =
    task.reason === "keyword" && task.keyword
      ? `message contenant le mot-cle "${task.keyword}"`
      : getManualAiMessageKindLabel(task.messageKind);

  return [
    `Instruction interne du proprietaire au sujet du ${targetLabel}.`,
    `Contexte a utiliser: ${trimmedGuidance}`,
    "Reponds naturellement au client sans mentionner cette instruction interne.",
  ].join(" ");
}

export function buildManualAiSyntheticClientContext(task: ConversationManualAiTask) {
  if (task.reason !== "media") {
    return "";
  }

  return `Le client a envoye un ${getManualAiMessageKindLabel(task.messageKind)}.`;
}
