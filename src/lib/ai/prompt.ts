import type { SuggestionPromptPayload, SuggestionRequestInput } from "./types";

const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARACTERS = 700;
const MAX_TOTAL_CHARACTERS = 4800;
const DEFAULT_MAX_RESPONSE_CHARACTERS = 320;
const MIN_MAX_RESPONSE_CHARACTERS = 80;
const ABSOLUTE_MAX_RESPONSE_CHARACTERS = 600;
const OWNER_REPLY_SENDERS = new Set(["owner", "ai"]);

type DetectedLanguage = "fr" | "en" | "es" | "pt";

const LANGUAGE_HINTS: Record<DetectedLanguage, string[]> = {
  fr: [
    "bonjour",
    "salut",
    "bonsoir",
    "merci",
    "besoin",
    "devis",
    "peux tu",
    "pouvez vous",
    "site web",
    "application web",
  ],
  en: [
    "hello",
    "hi",
    "hey",
    "thanks",
    "thank you",
    "i need",
    "can you",
    "could you",
    "website",
    "web app",
  ],
  es: [
    "hola",
    "gracias",
    "necesito",
    "puedes",
    "podrias",
    "precio",
    "sitio web",
    "aplicacion web",
    "por favor",
  ],
  pt: [
    "ola",
    "obrigado",
    "obrigada",
    "preciso",
    "voce",
    "pode",
    "aplicacao web",
    "por favor",
    "quero",
  ],
};

const GREETING_HINTS = [
  "bonjour",
  "salut",
  "bonsoir",
  "coucou",
  "hello",
  "hi",
  "hey",
  "hola",
  "buenas",
  "ola",
];

function truncate(value: string, size: number) {
  const normalized = value.trim();

  if (normalized.length <= size) {
    return normalized;
  }

  return `${normalized.slice(0, size - 1)}…`;
}

function sanitizeMessageContent(value: string) {
  return truncate(value.replace(/\s+/g, " "), MAX_MESSAGE_CHARACTERS);
}

function normalizeForDetection(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countHintMatches(text: string, hints: string[]) {
  return hints.reduce((score, hint) => {
    if (!hint) {
      return score;
    }

    return text.includes(hint) ? score + 1 : score;
  }, 0);
}

function detectLanguageFromText(value: string): DetectedLanguage {
  const normalized = normalizeForDetection(value);

  if (!normalized) {
    return "fr";
  }

  let bestLanguage: DetectedLanguage = "fr";
  let bestScore = 0;

  (Object.keys(LANGUAGE_HINTS) as DetectedLanguage[]).forEach((language) => {
    const score = countHintMatches(normalized, LANGUAGE_HINTS[language]);

    if (score > bestScore) {
      bestScore = score;
      bestLanguage = language;
    }
  });

  if (bestScore > 0) {
    return bestLanguage;
  }

  if (/[a-z]/.test(normalized) && /\b(the|and|with|for|you|your)\b/.test(normalized)) {
    return "en";
  }

  return "fr";
}

function getDetectedLanguageLabel(language: DetectedLanguage) {
  if (language === "en") {
    return "anglais";
  }

  if (language === "es") {
    return "espagnol";
  }

  if (language === "pt") {
    return "portugais";
  }

  return "francais";
}

function getLastClientMessageContent(
  input: Pick<SuggestionRequestInput, "messages">,
) {
  return [...input.messages]
    .reverse()
    .find((message) => message.sender === "client" && message.content.trim())
    ?.content.trim() || "";
}

function hasOwnerHistory(input: Pick<SuggestionRequestInput, "messages">) {
  return input.messages.some(
    (message) =>
      OWNER_REPLY_SENDERS.has(message.sender) && Boolean(message.content.trim()),
  );
}

function clientRecentlyGreeted(input: Pick<SuggestionRequestInput, "messages">) {
  const lastClientMessage = normalizeForDetection(getLastClientMessageContent(input));

  if (!lastClientMessage) {
    return false;
  }

  return GREETING_HINTS.some((greeting) => lastClientMessage.startsWith(greeting));
}

function shouldUseGreeting(input: Pick<SuggestionRequestInput, "messages">) {
  return !hasOwnerHistory(input) || clientRecentlyGreeted(input);
}

function buildLocalizedReply(
  language: DetectedLanguage,
  clientName: string,
  includeGreeting: boolean,
  baseQuestion: string,
) {
  const normalizedName = clientName.trim();
  const normalizedQuestion = baseQuestion.trim();
  const questionSuffix = normalizedQuestion ? ` ${normalizedQuestion}` : "";

  if (language === "en") {
    const prefix = includeGreeting
      ? normalizedName
        ? `Hello ${normalizedName}, `
        : "Hello, "
      : "";

    return `${prefix}thanks for your message. I noted your request.${questionSuffix} I will get back to you shortly with a precise answer.`;
  }

  if (language === "es") {
    const prefix = includeGreeting
      ? normalizedName
        ? `Hola ${normalizedName}, `
        : "Hola, "
      : "";

    return `${prefix}gracias por tu mensaje. He tomado nota de tu solicitud.${questionSuffix} Te respondere pronto con una respuesta precisa.`;
  }

  if (language === "pt") {
    const prefix = includeGreeting
      ? normalizedName
        ? `Ola ${normalizedName}, `
        : "Ola, "
      : "";

    return `${prefix}obrigado pela mensagem. Anotei o seu pedido.${questionSuffix} Vou responder em breve com uma resposta precisa.`;
  }

  const prefix = includeGreeting
    ? normalizedName
      ? `Bonjour ${normalizedName}, `
      : "Bonjour, "
    : "";

  return `${prefix}merci pour ton message. J ai bien note ta demande.${questionSuffix} Je reviens vers toi rapidement avec une reponse precise.`;
}

function buildTranscriptLines(input: SuggestionRequestInput) {
  const recentMessages = input.messages
    .filter(
      (message) =>
        typeof message?.sender === "string" && typeof message?.content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      sender: message.sender,
      content: sanitizeMessageContent(message.content),
    }))
    .filter((message) => Boolean(message.content));

  let totalCharacters = recentMessages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  while (recentMessages.length > 1 && totalCharacters > MAX_TOTAL_CHARACTERS) {
    const removedMessage = recentMessages.shift();

    if (!removedMessage) {
      break;
    }

    totalCharacters -= removedMessage.content.length;
  }

  const transcriptLines = recentMessages.map(
    (message, index) =>
      `${index + 1}. ${message.sender.toUpperCase()}: ${message.content}`,
  );

  const lastClientMessage =
    [...recentMessages]
      .reverse()
      .find((message) => message.sender === "client")
      ?.content || "";

  return {
    transcriptLines,
    lastClientMessage,
    messageCount: recentMessages.length,
    totalCharacters,
  };
}

function getBusinessContext(input: SuggestionRequestInput) {
  const businessContext =
    typeof input.globalBusinessContext === "string"
      ? input.globalBusinessContext.trim()
      : process.env.OWNER_BUSINESS_CONTEXT?.trim();

  if (businessContext) {
    return truncate(businessContext, 1_200);
  }

  return "Tu aides le proprietaire de Vichly Messenger a repondre a ses clients de facon professionnelle, directe et utile.";
}

function getAiTone() {
  const aiTone = process.env.OWNER_AI_TONE?.trim();

  if (aiTone) {
    return truncate(aiTone, 180);
  }

  return "professionnel, rassurant, concis";
}

function getEffectiveAiTone(input: SuggestionRequestInput) {
  const conversationTone = input.conversationSettings?.tone?.trim();

  if (conversationTone) {
    return truncate(conversationTone, 180);
  }

  return getAiTone();
}

function getEffectiveMaxLength(input: SuggestionRequestInput) {
  const configuredLength = input.conversationSettings?.maxLength;

  if (
    typeof configuredLength === "number" &&
    Number.isFinite(configuredLength)
  ) {
    return Math.min(
      Math.max(Math.round(configuredLength), MIN_MAX_RESPONSE_CHARACTERS),
      ABSOLUTE_MAX_RESPONSE_CHARACTERS,
    );
  }

  return DEFAULT_MAX_RESPONSE_CHARACTERS;
}

function getPromptBlacklist(input: SuggestionRequestInput) {
  const blacklistWords = input.conversationSettings?.blacklistWords || [];

  if (!blacklistWords.length) {
    return "";
  }

  return blacklistWords
    .map((word) => truncate(word, 24))
    .filter(Boolean)
    .join(", ");
}

function getConversationContext(input: SuggestionRequestInput) {
  const personalContext = input.conversationSettings?.personalContext?.trim();

  if (!personalContext) {
    return "";
  }

  return truncate(personalContext, 1_000);
}

export function buildSuggestionPrompt(
  input: SuggestionRequestInput,
): SuggestionPromptPayload {
  const { transcriptLines, lastClientMessage, messageCount, totalCharacters } =
    buildTranscriptLines(input);
  const conversationSummary = input.conversationSummary?.trim()
    ? truncate(input.conversationSummary.trim(), 1_400)
    : "";
  const effectiveMaxLength = getEffectiveMaxLength(input);
  const promptBlacklist = getPromptBlacklist(input);
  const detectedLanguage = detectLanguageFromText(lastClientMessage);
  const canUseGreeting = shouldUseGreeting(input);
  const conversationContext = getConversationContext(input);

  const currentDraft = input.draft?.trim()
    ? `Brouillon actuel du proprietaire a prendre en compte:\n${truncate(input.draft, 500)}`
    : "Aucun brouillon existant a reprendre.";
  const aiModeLabel = input.aiMode || "suggestion";

  return {
    systemPrompt: [
      "Tu rediges uniquement une suggestion de reponse pour un entrepreneur.",
      "Reponds dans la langue du dernier message du client. Si le client change de langue, adapte-toi a sa langue la plus recente.",
      "Ne donne aucune analyse ni liste. Retourne uniquement le message pret a etre relu.",
      "Ne promets rien qui ne soit pas explicitement mentionne.",
      "Si une information manque, propose une question de clarification courte.",
      canUseGreeting
        ? "Une salutation courte est acceptable seulement si elle reste naturelle."
        : "La conversation est deja en cours: ne commence pas la reponse par Bonjour, Hello ou toute autre salutation.",
      "Ne repete pas une salutation a chaque reponse.",
      `Ton: ${getEffectiveAiTone(input)}.`,
      `Longueur maximale: ${effectiveMaxLength} caracteres environ.`,
      promptBlacklist ? `Mots a ne jamais utiliser: ${promptBlacklist}.` : "",
      `Contexte business global: ${getBusinessContext(input)}`,
      conversationContext
        ? `Contexte specifique a cette conversation: ${conversationContext}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    userPrompt: [
      `Mode IA de la conversation: ${aiModeLabel}.`,
      `Nom du client: ${truncate(input.clientName, 80) || "Client"}.`,
      currentDraft,
      conversationSummary
        ? `Resume persistant de l historique precedent:\n${conversationSummary}`
        : "Aucun resume persistant disponible.",
      "Historique recent:",
      transcriptLines.length ? transcriptLines.join("\n") : "Aucun message disponible.",
      `Langue detectee sur le dernier message client: ${getDetectedLanguageLabel(detectedLanguage)}.`,
      lastClientMessage
        ? `Dernier message client prioritaire: ${lastClientMessage}`
        : "Aucun message client recent.",
      "Redige maintenant une suggestion unique que le proprietaire pourra valider manuellement. N envoie rien automatiquement.",
    ].join("\n\n"),
    messageCount,
    totalCharacters: totalCharacters + conversationSummary.length,
    lastClientMessage,
  };
}

export function buildBaseFallbackReply(
  input: Pick<SuggestionRequestInput, "clientName" | "messages">,
) {
  const lastClientMessage = getLastClientMessageContent(input);
  const language = detectLanguageFromText(lastClientMessage);

  return buildLocalizedReply(
    language,
    input.clientName,
    shouldUseGreeting(input),
    lastClientMessage,
  );
}

export function buildFallbackSuggestion(input: SuggestionRequestInput) {
  const effectiveMaxLength = getEffectiveMaxLength(input);

  return truncate(buildBaseFallbackReply(input), effectiveMaxLength);
}
