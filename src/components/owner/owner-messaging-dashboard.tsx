"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  Copy,
  LoaderCircle,
  Mic,
  MessageSquareMore,
  MoreVertical,
  Paperclip,
  Reply,
  Search,
  SendHorizontal,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import {
  buildAiConversationRequestPayload,
  buildAiMessagePayload,
  createReplyReference,
  deleteOwnerConversation,
  deleteOwnerMessage,
  getChatRuntimeConfig,
  getConversationSnapshot,
  getOwnerConversationSummaries,
  markConversationSeen,
  requestAutoReplyIfNeeded,
  sendOwnerMessage,
  setConversationAiMode,
  submitOwnerManualAiGuidance,
  syncOwnerConversationState,
  syncOwnerConversationThread,
  subscribeToChatSnapshots,
  updateConversationAiSettings,
  type ChatConversationRecord,
  type ChatConversationSummary,
  type ConversationManualAiTask,
  type ChatMessageRecord,
  type ChatMessageReplyReference,
} from "@/lib/chat";
import { getManualAiMessageKindLabel } from "@/lib/chat/manual-ai";
import {
  toChatMessageDraftFromUpload,
  uploadChatAttachment,
} from "@/lib/chat/media-client";
import {
  createBrowserCacheKey,
  readBrowserCache,
  removeOutdatedBrowserCacheVersions,
  runWhenBrowserIdle,
  writeBrowserCache,
} from "@/lib/utils/browser-cache";
import { copyText } from "@/lib/utils/copy-text";
import { createId } from "@/lib/utils/create-id";

type SuggestionApiResponse = {
  suggestion: string;
  model: string;
  source: "openai" | "fallback";
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: string;
  };
  requestId: string;
  promptMetrics: {
    messageCount: number;
    totalCharacters: number;
  };
};

type ConversationReportApiResponse = {
  analysis: string;
  source: "openai" | "fallback";
  model: string;
};

type ConversationReportData = {
  startDateKey: string;
  endDateKey: string;
  dateKeys: string[];
  messages: ChatConversationRecord["messages"];
  stats: {
    total: number;
    client: number;
    owner: number;
    ai: number;
  };
  highlights: {
    firstClientMessage: string;
    lastClientMessage: string;
    lastOwnerMessage: string;
  };
  aiAnalysis: string;
  aiSource: "openai" | "fallback";
  aiModel: string;
};

type ConversationSettingsEditor = {
  tone: string;
  personalContext: string;
  maxLength: string;
  blacklistWords: string;
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  scheduleTimezone: string;
};

type OwnerProfile = {
  ownerId: string;
  displayName: string;
  jobTitle: string;
  avatarUrl: string;
  aiBusinessContext: string;
  aiAttentionKeywords: string[];
  updatedAt: string;
};

type InboxFilter = "all" | "unread" | "drafts";
const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  ownerId: "vichly-owner",
  displayName:
    process.env.NEXT_PUBLIC_OWNER_DISPLAY_NAME || "Toussaint Leo Vitch",
  jobTitle: process.env.NEXT_PUBLIC_OWNER_JOB_TITLE || "Entrepreneur",
  avatarUrl: process.env.NEXT_PUBLIC_OWNER_AVATAR_URL || "",
  aiBusinessContext: "",
  aiAttentionKeywords: [],
  updatedAt: "",
};
const OWNER_SYNC_INTERVAL_MS = 6_000;
const THREAD_MESSAGE_RENDER_LIMIT = 160;
const THREAD_MESSAGE_RENDER_STEP = 160;
const CONVERSATION_LIST_RENDER_LIMIT = 80;
const CONVERSATION_LIST_RENDER_STEP = 80;
const SCROLL_TO_LATEST_THRESHOLD_PX = 96;
const OWNER_PROFILE_CACHE_NAMESPACE = "vichly_owner_profile_cache";
const OWNER_PROFILE_CACHE_KEY = createBrowserCacheKey(OWNER_PROFILE_CACHE_NAMESPACE);
const OWNER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const OWNER_PROFILE_CACHE_MAX_BYTES = 16_000;
const OwnerDraftsWorkspace = dynamic(
  () => import("@/components/owner/owner-drafts-workspace"),
  {
    loading: () => (
      <section className="flex h-[calc(100dvh-1rem)] items-center justify-center rounded-[1.4rem] border border-white/8 bg-black/10 shadow-[0_24px_70px_rgba(0,0,0,0.34)] md:rounded-[1.8rem]">
        <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200">
          <LoaderCircle className="size-4 animate-spin" />
          Chargement des brouillons...
        </div>
      </section>
    ),
  },
);
const OwnerDashboardModals = dynamic(
  () => import("@/components/owner/owner-dashboard-modals"),
  {
    loading: () => (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
        <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-[#111b21]/92 px-5 py-3 text-sm font-semibold text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          <LoaderCircle className="size-4 animate-spin" />
          Chargement des parametres...
        </div>
      </div>
    ),
  },
);

function createConversationSettingsEditor(
  conversation: ChatConversationRecord,
): ConversationSettingsEditor {
  return {
    tone: conversation.aiSettings.tone,
    personalContext: conversation.aiSettings.personalContext,
    maxLength: String(conversation.aiSettings.maxLength),
    blacklistWords: conversation.aiSettings.blacklistWords.join(", "),
    scheduleEnabled: conversation.aiSettings.scheduleEnabled,
    scheduleStart: conversation.aiSettings.scheduleStart,
    scheduleEnd: conversation.aiSettings.scheduleEnd,
    scheduleTimezone: conversation.aiSettings.scheduleTimezone,
  };
}

function formatListTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isViewportNearBottom(viewport: HTMLDivElement) {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
    SCROLL_TO_LATEST_THRESHOLD_PX
  );
}

function formatBubbleTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDayLabel(timestamp: string) {
  const currentDate = new Date();
  const targetDate = new Date(timestamp);

  const currentDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );
  const targetDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );

  const dayDiff = Math.round(
    (currentDay.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (dayDiff === 0) {
    return "Aujourd'hui";
  }

  if (dayDiff === 1) {
    return "Hier";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: currentDay.getFullYear() === targetDay.getFullYear() ? undefined : "numeric",
  }).format(targetDate);
}

function getConversationDateKey(timestamp: string) {
  const targetDate = new Date(timestamp);
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatReportDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((segment) => Number(segment));

  if (!year || !month || !day) {
    return dateKey;
  }

  return formatDayLabel(new Date(year, month - 1, day, 12, 0, 0).toISOString());
}

function getAvailableConversationDateKeys(
  messages: ChatConversationRecord["messages"],
) {
  return [...new Set(messages.map((message) => getConversationDateKey(message.timestamp)))]
    .sort((left, right) => left.localeCompare(right));
}

function buildMessageGroups(messages: ChatConversationRecord["messages"]) {
  return messages.reduce<
    Array<{ label: string; items: ChatConversationRecord["messages"] }>
  >((groups, message) => {
    const label = formatDayLabel(message.timestamp);
    const lastGroup = groups.at(-1);

    if (!lastGroup || lastGroup.label !== label) {
      groups.push({
        label,
        items: [message],
      });
      return groups;
    }

    lastGroup.items.push(message);
    return groups;
  }, []);
}

function buildConversationReport(
  messages: ChatConversationRecord["messages"],
  startDateKey: string,
  endDateKey: string,
): ConversationReportData | null {
  const selectedMessages = messages.filter((message) => {
    const dateKey = getConversationDateKey(message.timestamp);

    return dateKey >= startDateKey && dateKey <= endDateKey;
  });

  if (!selectedMessages.length) {
    return null;
  }

  const dateKeys = getAvailableConversationDateKeys(selectedMessages);
  const firstClientMessageRecord = selectedMessages.find(
    (message) => message.sender === "client",
  );
  const lastClientMessageRecord = [...selectedMessages]
    .reverse()
    .find((message) => message.sender === "client");
  const lastOwnerMessageRecord = [...selectedMessages]
    .reverse()
    .find((message) => message.sender === "owner" || message.sender === "ai");
  const firstClientMessage = firstClientMessageRecord
    ? getReadableMessageContent(firstClientMessageRecord)
    : "";
  const lastClientMessage = lastClientMessageRecord
    ? getReadableMessageContent(lastClientMessageRecord)
    : "";
  const lastOwnerMessage = lastOwnerMessageRecord
    ? getReadableMessageContent(lastOwnerMessageRecord)
    : "";

  return {
    startDateKey,
    endDateKey,
    dateKeys,
    messages: selectedMessages,
    stats: {
      total: selectedMessages.length,
      client: selectedMessages.filter((message) => message.sender === "client").length,
      owner: selectedMessages.filter((message) => message.sender === "owner").length,
      ai: selectedMessages.filter((message) => message.sender === "ai").length,
    },
    highlights: {
      firstClientMessage,
      lastClientMessage,
      lastOwnerMessage,
    },
    aiAnalysis: "",
    aiSource: "fallback",
    aiModel: "",
  };
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "CL";
  }

  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function getAvatarTone(name: string) {
  const palette = [
    "from-emerald-400 to-emerald-700",
    "from-cyan-400 to-cyan-700",
    "from-amber-400 to-orange-700",
    "from-pink-400 to-fuchsia-700",
    "from-sky-400 to-blue-700",
    "from-lime-400 to-emerald-700",
  ];

  const seed = name.split("").reduce((total, char) => total + char.charCodeAt(0), 0);

  return palette[seed % palette.length];
}

function getMessagePreview(
  conversation: ChatConversationSummary,
  ownerDisplayName: string,
) {
  if (!conversation.lastMessagePreview) {
    return "Nouvelle conversation";
  }

  if (
    conversation.lastMessageSender === "owner" ||
    conversation.lastMessageSender === "ai"
  ) {
    return `${ownerDisplayName}: ${conversation.lastMessagePreview}`;
  }

  return conversation.lastMessagePreview;
}

function formatFileSize(sizeInBytes: number) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return "";
  }

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} o`;
  }

  const sizeInKb = sizeInBytes / 1024;

  if (sizeInKb < 1024) {
    return `${sizeInKb.toFixed(1)} KB`;
  }

  return `${(sizeInKb / 1024).toFixed(1)} MB`;
}

function getReadableMessageContent(message: ChatMessageRecord) {
  if (message.kind === "voice") {
    return message.transcript.trim() || "Message vocal";
  }

  if (message.kind === "image") {
    return message.content.trim() || "Photo envoyee";
  }

  if (message.kind === "video") {
    return message.content.trim() || "Video envoyee";
  }

  if (message.kind === "file") {
    return message.content.trim() || message.fileName || "Fichier joint";
  }

  return message.content.trim();
}

function getReplyPreviewText(replyTo: ChatMessageReplyReference) {
  return (
    replyTo.content.trim() ||
    (replyTo.kind === "voice"
      ? "Message vocal"
      : replyTo.fileName.trim() || "Message")
  );
}

function renderMessageBody(message: ChatMessageRecord) {
  if (message.kind === "image") {
    return (
      <div className="mt-2 space-y-2">
        <img
          src={message.storageUrl}
          alt={message.fileName || "Image envoyee"}
          className="max-h-72 w-full rounded-xl border border-white/10 object-cover"
          loading="lazy"
          decoding="async"
        />
        {message.content ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : null}
      </div>
    );
  }

  if (message.kind === "video") {
    return (
      <div className="mt-2 space-y-2">
        <video
          src={message.storageUrl}
          controls
          preload="none"
          className="max-h-72 w-full rounded-xl border border-white/10"
        />
        {message.content ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : null}
      </div>
    );
  }

  if (message.kind === "voice") {
    return (
      <div className="mt-2 space-y-1.5">
        <audio
          src={message.storageUrl}
          controls
          preload="none"
          className="h-10 w-full max-w-xs"
        />
        {message.durationMs ? (
          <p className="text-xs text-slate-300/80">
            {Math.max(1, Math.round(message.durationMs / 1000))} sec
          </p>
        ) : null}
      </div>
    );
  }

  if (message.kind === "file") {
    return (
      <div className="mt-2">
        <a
          href={message.storageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/15 bg-black/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-black/25"
        >
          <span className="truncate">{message.fileName || "Fichier joint"}</span>
          {message.fileSize ? (
            <span className="shrink-0 text-[11px] text-slate-300/90">
              {formatFileSize(message.fileSize)}
            </span>
          ) : null}
        </a>
      </div>
    );
  }

  return (
    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
      {message.content}
    </p>
  );
}

function getMicrophoneErrorMessage(error: unknown) {
  const errorName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";

  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return "Micro bloque. Autorise le micro dans ton navigateur puis recharge la page.";
  }

  if (errorName === "NotFoundError") {
    return "Aucun micro detecte sur cet appareil.";
  }

  if (errorName === "NotReadableError") {
    return "Le micro est deja utilise par une autre application.";
  }

  return "Impossible d acceder au micro.";
}

type LegacyNavigatorGetUserMedia = Navigator & {
  getUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: unknown) => void,
  ) => void;
  webkitGetUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: unknown) => void,
  ) => void;
  mozGetUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: unknown) => void,
  ) => void;
};

async function requestMicrophoneStream() {
  if (
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  }

  const legacyNavigator = navigator as LegacyNavigatorGetUserMedia;
  const legacyGetUserMedia =
    legacyNavigator.getUserMedia ||
    legacyNavigator.webkitGetUserMedia ||
    legacyNavigator.mozGetUserMedia;

  if (typeof legacyGetUserMedia !== "function") {
    throw new Error("MICROPHONE_API_UNAVAILABLE");
  }

  return new Promise<MediaStream>((resolve, reject) => {
    legacyGetUserMedia.call(
      legacyNavigator,
      {
        audio: true,
      },
      (stream) => resolve(stream),
      (error) => reject(error),
    );
  });
}

export default function OwnerMessagingDashboard() {
  const runtime = getChatRuntimeConfig();
  const router = useRouter();
  const threadViewportRef = useRef<HTMLDivElement | null>(null);
  const conversationListViewportRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const ownerSyncAbortRef = useRef<AbortController | null>(null);
  const threadSyncRequestRef = useRef(0);
  const autoReplyRequestRef = useRef<Record<string, string>>({});
  const shouldStickThreadToBottomRef = useRef(true);
  const lastScrolledThreadConversationIdRef = useRef("");
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedConversation, setSelectedConversation] =
    useState<ChatConversationRecord | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [mobilePanel, setMobilePanel] = useState<"list" | "thread">("list");
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiErrorMessage, setAiErrorMessage] = useState("");
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [aiMeta, setAiMeta] = useState<Pick<
    SuggestionApiResponse,
    "model" | "source" | "rateLimit"
  > | null>(null);
  const [settingsEditor, setSettingsEditor] = useState<ConversationSettingsEditor | null>(
    null,
  );
  const [settingsErrorMessage, setSettingsErrorMessage] = useState("");
  const [settingsStatusMessage, setSettingsStatusMessage] = useState("");
  const [showConversationSettings, setShowConversationSettings] = useState(false);
  const [showReportRangeModal, setShowReportRangeModal] = useState(false);
  const [showReportResultModal, setShowReportResultModal] = useState(false);
  const [reportStartDateKey, setReportStartDateKey] = useState("");
  const [reportEndDateKey, setReportEndDateKey] = useState("");
  const [reportErrorMessage, setReportErrorMessage] = useState("");
  const [reportData, setReportData] = useState<ConversationReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showGeneralSettings, setShowGeneralSettings] = useState(false);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessageReplyReference | null>(
    null,
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [messageContextMenu, setMessageContextMenu] = useState<{
    messageId: string;
    x: number;
    y: number;
  } | null>(null);
  const [activeSwipeMessageId, setActiveSwipeMessageId] = useState("");
  const [activeSwipeOffset, setActiveSwipeOffset] = useState(0);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(DEFAULT_OWNER_PROFILE);
  const [profileDraft, setProfileDraft] = useState({
    displayName: DEFAULT_OWNER_PROFILE.displayName,
    jobTitle: DEFAULT_OWNER_PROFILE.jobTitle,
    avatarUrl: DEFAULT_OWNER_PROFILE.avatarUrl,
    aiBusinessContext: DEFAULT_OWNER_PROFILE.aiBusinessContext,
    aiAttentionKeywords: DEFAULT_OWNER_PROFILE.aiAttentionKeywords.join(", "),
  });
  const [profileErrorMessage, setProfileErrorMessage] = useState("");
  const [profileStatusMessage, setProfileStatusMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isInboxSyncing, setIsInboxSyncing] = useState(false);
  const [hasCompletedInitialInboxSync, setHasCompletedInitialInboxSync] = useState(false);
  const [isThreadSyncing, setIsThreadSyncing] = useState(false);
  const [visibleConversationCount, setVisibleConversationCount] = useState(
    CONVERSATION_LIST_RENDER_LIMIT,
  );
  const [visibleThreadMessageCount, setVisibleThreadMessageCount] = useState(
    THREAD_MESSAGE_RENDER_LIMIT,
  );
  const [showScrollToLatestButton, setShowScrollToLatestButton] = useState(false);
  const [pendingOutgoingMessages, setPendingOutgoingMessages] = useState<
    Array<{
      conversationId: string;
      message: ChatMessageRecord;
    }>
  >([]);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [manualGuidanceDrafts, setManualGuidanceDrafts] = useState<Record<string, string>>({});
  const [submittingManualTaskId, setSubmittingManualTaskId] = useState("");
  const notifiedManualTaskIdsRef = useRef<Record<string, boolean>>({});
  const conversationMenuRef = useRef<HTMLDivElement | null>(null);
  const swipeStateRef = useRef<{
    messageId: string;
    startX: number;
    startY: number;
    offsetX: number;
  } | null>(null);

  function runThreadSync(conversationId: string) {
    const requestId = threadSyncRequestRef.current + 1;
    threadSyncRequestRef.current = requestId;
    setIsThreadSyncing(true);

    void syncOwnerConversationThread(runtime.ownerId, conversationId).finally(() => {
      if (threadSyncRequestRef.current === requestId) {
        setIsThreadSyncing(false);
      }
    });
  }

  useEffect(() => {
    const refreshInbox = () => {
      const nextConversations = getOwnerConversationSummaries(runtime.ownerId);
      setConversations(nextConversations);

      setSelectedConversationId((currentValue) => {
        if (
          currentValue &&
          nextConversations.some((conversation) => conversation.id === currentValue)
        ) {
          return currentValue;
        }

        return nextConversations[0]?.id || "";
      });
    };

    refreshInbox();

    return subscribeToChatSnapshots(() => {
      refreshInbox();
    });
  }, [runtime.ownerId]);

  useEffect(() => {
    let syncIntervalId = 0;

    const runSync = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (ownerSyncAbortRef.current) {
        return;
      }

      setIsInboxSyncing(true);
      const controller = new AbortController();
      ownerSyncAbortRef.current = controller;
      void syncOwnerConversationState(runtime.ownerId, {
        signal: controller.signal,
      }).finally(() => {
        if (ownerSyncAbortRef.current === controller) {
          ownerSyncAbortRef.current = null;
        }
        setIsInboxSyncing(false);
        setHasCompletedInitialInboxSync(true);
      });
    };

    const refreshPollingWindow = () => {
      if (syncIntervalId) {
        window.clearInterval(syncIntervalId);
        syncIntervalId = 0;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      syncIntervalId = window.setInterval(() => {
        runSync();
      }, OWNER_SYNC_INTERVAL_MS);
    };

    const onWindowFocus = () => {
      runSync();
      refreshPollingWindow();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runSync();
      } else {
        ownerSyncAbortRef.current?.abort();
        ownerSyncAbortRef.current = null;
      }
      refreshPollingWindow();
    };

    runSync();
    refreshPollingWindow();
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (syncIntervalId) {
        window.clearInterval(syncIntervalId);
      }
      ownerSyncAbortRef.current?.abort();
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [runtime.ownerId]);

  useEffect(() => {
    removeOutdatedBrowserCacheVersions(OWNER_PROFILE_CACHE_NAMESPACE);
    const cachedProfile = readBrowserCache<OwnerProfile>(OWNER_PROFILE_CACHE_KEY);

    if (cachedProfile) {
      const nextProfile = {
        ...DEFAULT_OWNER_PROFILE,
        ...cachedProfile,
      };

      setOwnerProfile(nextProfile);
      setProfileDraft({
        displayName: nextProfile.displayName,
        jobTitle: nextProfile.jobTitle,
        avatarUrl: nextProfile.avatarUrl,
        aiBusinessContext: nextProfile.aiBusinessContext,
        aiAttentionKeywords: nextProfile.aiAttentionKeywords.join(", "),
      });
    }

    async function loadOwnerProfile() {
      try {
        const response = await fetch("/api/owner/profile", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as OwnerProfile;
        const nextProfile = {
          ...DEFAULT_OWNER_PROFILE,
          ...payload,
        };

        setOwnerProfile(nextProfile);
        setProfileDraft({
          displayName: nextProfile.displayName,
          jobTitle: nextProfile.jobTitle,
          avatarUrl: nextProfile.avatarUrl,
          aiBusinessContext: nextProfile.aiBusinessContext,
          aiAttentionKeywords: nextProfile.aiAttentionKeywords.join(", "),
        });
        writeBrowserCache(
          OWNER_PROFILE_CACHE_KEY,
          nextProfile,
          OWNER_PROFILE_CACHE_TTL_MS,
          {
            maxBytes: OWNER_PROFILE_CACHE_MAX_BYTES,
          },
        );
      } catch {
        // Keep defaults.
      }
    }

    const cancelIdleLoad = runWhenBrowserIdle(() => {
      void loadOwnerProfile();
    });

    return () => {
      cancelIdleLoad();
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // Ignore recorder teardown errors.
      }
      recorderRef.current = null;
      recorderChunksRef.current = [];
      recordingStartedAtRef.current = null;

      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        recorderStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showGeneralSettings) {
      return;
    }

    setProfileDraft({
      displayName: ownerProfile.displayName,
      jobTitle: ownerProfile.jobTitle,
      avatarUrl: ownerProfile.avatarUrl,
      aiBusinessContext: ownerProfile.aiBusinessContext,
      aiAttentionKeywords: ownerProfile.aiAttentionKeywords.join(", "),
    });
    setProfileErrorMessage("");
    setProfileStatusMessage("");
  }, [ownerProfile, showGeneralSettings]);

  useEffect(() => {
    if (!showConversationMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        conversationMenuRef.current &&
        event.target instanceof Node &&
        !conversationMenuRef.current.contains(event.target)
      ) {
        setShowConversationMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [showConversationMenu]);

  useEffect(() => {
    if (!messageContextMenu) {
      return;
    }

    const handlePointerDown = () => {
      setMessageContextMenu(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("scroll", handlePointerDown, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("scroll", handlePointerDown, true);
    };
  }, [messageContextMenu]);

  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConversation(null);
      setMobilePanel("list");
      return;
    }

    const snapshot = getConversationSnapshot(selectedConversationId);
    setSelectedConversation(snapshot?.conversation || null);
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const selectedSummary = conversations.find(
      (conversation) => conversation.id === selectedConversationId,
    );

    if (!selectedSummary) {
      return;
    }

    const snapshot = getConversationSnapshot(selectedConversationId);
    const conversation = snapshot?.conversation || null;
    const needsThreadSync =
      !conversation ||
      conversation.threadHydrated === false ||
      selectedSummary.messageCount > conversation.messages.length ||
      selectedSummary.updatedAt > conversation.updatedAt;

    if (!needsThreadSync) {
      setIsThreadSyncing(false);
      return;
    }

    runThreadSync(selectedConversationId);
  }, [conversations, runtime.ownerId, selectedConversationId]);

  useEffect(() => {
    const browserWindow = typeof window === "undefined" ? null : window;

    if (!browserWindow || !("Notification" in browserWindow)) {
      return;
    }

    conversations.forEach((conversation) => {
      if (!conversation.pendingManualTaskCount) {
        return;
      }

      const notificationKey = `${conversation.id}:${conversation.pendingManualTaskCount}:${conversation.updatedAt}`;

      if (notifiedManualTaskIdsRef.current[notificationKey]) {
        return;
      }

      notifiedManualTaskIdsRef.current[notificationKey] = true;

      if (browserWindow.Notification.permission === "granted") {
        const pluralSuffix = conversation.pendingManualTaskCount > 1 ? "s" : "";
        new browserWindow.Notification("Intervention IA requise", {
          body: `${conversation.clientName} attend un contexte manuel pour ${conversation.pendingManualTaskCount} element${pluralSuffix}.`,
        });
      }
    });
  }, [conversations]);

  useEffect(() => {
    if (selectedConversation?.unreadOwnerCount) {
      markConversationSeen(selectedConversation.id, "owner");
    }
  }, [selectedConversation?.id, selectedConversation?.unreadOwnerCount]);

  useEffect(() => {
    setVisibleThreadMessageCount(THREAD_MESSAGE_RENDER_LIMIT);
    setReplyTarget(null);
    setMessageContextMenu(null);
    setActiveSwipeMessageId("");
    setActiveSwipeOffset(0);
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!highlightedMessageId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId("");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedMessageId]);

  useEffect(() => {
    conversations.forEach((conversation) => {
      if (conversation.aiMode !== "auto" || conversation.lastMessageSender !== "client") {
        autoReplyRequestRef.current[conversation.id] = "";
        return;
      }

      const snapshot = getConversationSnapshot(conversation.id);
      const lastMessage = snapshot?.conversation.messages.at(-1);

      if (!lastMessage || lastMessage.sender !== "client") {
        return;
      }

      if (autoReplyRequestRef.current[conversation.id] === lastMessage.id) {
        return;
      }

      autoReplyRequestRef.current[conversation.id] = lastMessage.id;
      void requestAutoReplyIfNeeded(conversation.id);
    });
  }, [conversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setAiSuggestion("");
      setAiErrorMessage("");
      setAiMeta(null);
      setSettingsEditor(null);
      setSettingsErrorMessage("");
      setSettingsStatusMessage("");
      setShowConversationSettings(false);
      setShowReportRangeModal(false);
      setShowReportResultModal(false);
      setReportData(null);
      setReportErrorMessage("");
      setIsGeneratingReport(false);
      return;
    }

    setAiSuggestion("");
    setAiErrorMessage("");
    setAiMeta(null);

    const snapshot = getConversationSnapshot(selectedConversationId);

    if (!snapshot?.conversation) {
      setSettingsEditor(null);
      setSettingsErrorMessage("");
      setSettingsStatusMessage("");
      setShowConversationSettings(false);
      setShowReportRangeModal(false);
      setShowReportResultModal(false);
      setReportData(null);
      setReportErrorMessage("");
      setIsGeneratingReport(false);
      return;
    }

    setSettingsEditor(createConversationSettingsEditor(snapshot.conversation));
    setSettingsErrorMessage("");
    setSettingsStatusMessage("");
  }, [selectedConversationId]);

  const searchedConversations = conversations.filter((conversation) => {
    if (!deferredSearch) {
      return true;
    }

    const searchTarget = [
      conversation.clientName,
      conversation.lastMessagePreview,
      conversation.lastMessageSender || "",
    ]
      .join(" ")
      .toLowerCase();

    return searchTarget.includes(deferredSearch);
  });

  const visibleConversations = searchedConversations.filter((conversation) => {
    if (activeFilter === "all") {
      return true;
    }

    if (activeFilter === "unread") {
      return conversation.unreadOwnerCount > 0;
    }

    return false;
  });
  const selectedConversationIndex = visibleConversations.findIndex(
    (conversation) => conversation.id === selectedConversationId,
  );
  const renderedConversationCount =
    selectedConversationIndex >= 0
      ? Math.max(visibleConversationCount, selectedConversationIndex + 1)
      : visibleConversationCount;
  const renderedConversations = visibleConversations.slice(0, renderedConversationCount);
  const hiddenConversationCount =
    visibleConversations.length > renderedConversations.length
      ? visibleConversations.length - renderedConversations.length
      : 0;

  const inboxStats = {
    threadCount: conversations.length,
    unreadMessages: conversations.reduce(
      (total, conversation) => total + conversation.unreadOwnerCount,
      0,
    ),
  };
  const pendingSelectedMessages = pendingOutgoingMessages
    .filter((entry) => entry.conversationId === selectedConversation?.id)
    .map((entry) => entry.message);

  const renderedMessages = useMemo(() => {
    const allMessages = [
      ...(selectedConversation?.messages || []),
      ...pendingSelectedMessages,
    ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    if (allMessages.length <= visibleThreadMessageCount) {
      return allMessages;
    }

    return allMessages.slice(-visibleThreadMessageCount);
  }, [pendingSelectedMessages, selectedConversation?.messages, visibleThreadMessageCount]);
  const totalDisplayedMessageCount =
    (selectedConversation?.messages.length || 0) + pendingSelectedMessages.length;
  const hiddenMessageCount =
    totalDisplayedMessageCount > renderedMessages.length
      ? totalDisplayedMessageCount - renderedMessages.length
      : 0;
  const messageGroups = useMemo(
    () => buildMessageGroups(renderedMessages),
    [renderedMessages],
  );
  const availableReportDateKeys = useMemo(
    () => getAvailableConversationDateKeys(selectedConversation?.messages || []),
    [selectedConversation?.messages],
  );
  const availableReportDateOptions = useMemo(
    () =>
      availableReportDateKeys.map((dateKey) => ({
        value: dateKey,
        label: formatReportDateLabel(dateKey),
      })),
    [availableReportDateKeys],
  );
  const ownerDisplayName = ownerProfile.displayName || DEFAULT_OWNER_PROFILE.displayName;
  const ownerJobTitle = ownerProfile.jobTitle || DEFAULT_OWNER_PROFILE.jobTitle;
  const selectedRecoveryId = selectedConversation?.recoveryKey?.trim() || "";
  const pendingManualTasks = useMemo(
    () =>
      (selectedConversation?.manualAiTasks || []).filter(
        (task) => task.status === "pending",
      ),
    [selectedConversation?.manualAiTasks],
  );
  const pendingManualTaskByMessageId = useMemo(
    () =>
      new Map(
        pendingManualTasks.map((task) => [task.messageId, task] as const),
      ),
    [pendingManualTasks],
  );
  const latestRenderedMessageId = renderedMessages.at(-1)?.id || "";
  const contextMenuMessage =
    messageContextMenu &&
    [...(selectedConversation?.messages || []), ...pendingSelectedMessages].find(
      (message) => message.id === messageContextMenu.messageId,
    );
  const reportMessageGroups = useMemo(
    () => (reportData ? buildMessageGroups(reportData.messages) : []),
    [reportData],
  );
  const shouldLoadOwnerModals =
    showGeneralSettings ||
    showConversationSettings ||
    showReportRangeModal ||
    showReportResultModal;

  useEffect(() => {
    const viewport = threadViewportRef.current;

    if (!viewport) {
      return;
    }

    const currentConversationId = selectedConversation?.id || "";
    const shouldAutoScroll =
      lastScrolledThreadConversationIdRef.current !== currentConversationId ||
      shouldStickThreadToBottomRef.current;

    lastScrolledThreadConversationIdRef.current = currentConversationId;

    if (!shouldAutoScroll) {
      setShowScrollToLatestButton(
        !isViewportNearBottom(viewport) &&
          viewport.scrollHeight > viewport.clientHeight + SCROLL_TO_LATEST_THRESHOLD_PX,
      );
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "auto",
      });
      shouldStickThreadToBottomRef.current = true;
      setShowScrollToLatestButton(false);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [latestRenderedMessageId, renderedMessages.length, selectedConversation?.id]);

  useEffect(() => {
    const viewport = threadViewportRef.current;

    if (!viewport) {
      return;
    }

    const updateViewportState = () => {
      const nextShowScrollButton =
        !isViewportNearBottom(viewport) &&
        viewport.scrollHeight > viewport.clientHeight + SCROLL_TO_LATEST_THRESHOLD_PX;

      shouldStickThreadToBottomRef.current = !nextShowScrollButton;
      setShowScrollToLatestButton(nextShowScrollButton);
    };

    updateViewportState();
    viewport.addEventListener("scroll", updateViewportState, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", updateViewportState);
    };
  }, [renderedMessages.length, selectedConversation?.id]);

  useEffect(() => {
    setVisibleConversationCount(CONVERSATION_LIST_RENDER_LIMIT);

    if (conversationListViewportRef.current) {
      conversationListViewportRef.current.scrollTop = 0;
    }
  }, [activeFilter, deferredSearch]);

  function loadMoreConversations() {
    setVisibleConversationCount((currentValue) =>
      Math.min(
        visibleConversations.length,
        currentValue + CONVERSATION_LIST_RENDER_STEP,
      ),
    );
  }

  function scrollThreadToLatestMessage() {
    const viewport = threadViewportRef.current;

    if (!viewport) {
      return;
    }

    shouldStickThreadToBottomRef.current = true;
    setShowScrollToLatestButton(false);
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }

  function beginReplyToMessage(message: ChatMessageRecord) {
    setReplyTarget(createReplyReference(message));
    setMessageContextMenu(null);
    setActiveSwipeMessageId("");
    setActiveSwipeOffset(0);
  }

  function jumpToThreadMessage(messageId: string) {
    const allMessages = [
      ...(selectedConversation?.messages || []),
      ...pendingSelectedMessages,
    ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const targetIndex = allMessages.findIndex((message) => message.id === messageId);

    if (targetIndex < 0) {
      return;
    }

    setVisibleThreadMessageCount((currentValue) =>
      Math.max(currentValue, allMessages.length - targetIndex),
    );
    setHighlightedMessageId(messageId);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const targetElement = document.querySelector<HTMLElement>(
          `[data-owner-message-id="${messageId}"]`,
        );

        targetElement?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      });
    });
  }

  function handleMessageContextMenu(
    event: React.MouseEvent<HTMLElement>,
    message: ChatMessageRecord,
  ) {
    if (window.innerWidth < 1024) {
      return;
    }

    event.preventDefault();
    setMessageContextMenu({
      messageId: message.id,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleMessageTouchStart(
    event: React.TouchEvent<HTMLElement>,
    message: ChatMessageRecord,
  ) {
    if (window.innerWidth >= 1024) {
      return;
    }

    const touch = event.touches[0];

    if (!touch) {
      return;
    }

    swipeStateRef.current = {
      messageId: message.id,
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: 0,
    };
    setActiveSwipeMessageId(message.id);
    setActiveSwipeOffset(0);
  }

  function handleMessageTouchMove(event: React.TouchEvent<HTMLElement>) {
    const state = swipeStateRef.current;
    const touch = event.touches[0];

    if (!state || !touch) {
      return;
    }

    const diffX = touch.clientX - state.startX;
    const diffY = touch.clientY - state.startY;

    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      swipeStateRef.current = null;
      setActiveSwipeMessageId("");
      setActiveSwipeOffset(0);
      return;
    }

    const nextOffset = Math.min(0, Math.max(diffX, -84));
    state.offsetX = nextOffset;
    setActiveSwipeOffset(nextOffset);
  }

  function handleMessageTouchEnd(message: ChatMessageRecord) {
    const state = swipeStateRef.current;

    if (state && state.messageId === message.id && state.offsetX <= -56) {
      beginReplyToMessage(message);
    }

    swipeStateRef.current = null;
    setActiveSwipeMessageId("");
    setActiveSwipeOffset(0);
  }

  function handleConversationListScroll() {
    const viewport = conversationListViewportRef.current;

    if (!viewport || hiddenConversationCount <= 0) {
      return;
    }

    const remainingScroll = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

    if (remainingScroll <= 180) {
      loadMoreConversations();
    }
  }

  function handleProfileFieldChange(
    field:
      | "displayName"
      | "jobTitle"
      | "avatarUrl"
      | "aiBusinessContext"
      | "aiAttentionKeywords",
    value: string,
  ) {
    setProfileDraft((currentValue) => ({
      ...currentValue,
      [field]: value,
    }));
    setProfileErrorMessage("");
    setProfileStatusMessage("");
  }

  function handleReportStartDateChange(nextStart: string) {
    setReportStartDateKey(nextStart);

    if (reportEndDateKey && nextStart > reportEndDateKey) {
      setReportEndDateKey(nextStart);
    }
  }

  function handleReportEndDateChange(nextEnd: string) {
    setReportEndDateKey(nextEnd);

    if (reportStartDateKey && nextEnd < reportStartDateKey) {
      setReportStartDateKey(nextEnd);
    }
  }

  async function handleSaveOwnerProfile() {
    setProfileErrorMessage("");
    setProfileStatusMessage("");
    setIsSavingProfile(true);

    try {
      const response = await fetch("/api/owner/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...profileDraft,
          aiAttentionKeywords: profileDraft.aiAttentionKeywords
            .split(",")
            .map((keyword) => keyword.trim().toLowerCase())
            .filter(Boolean),
        }),
      });

      const payload = (await response.json()) as OwnerProfile | { error?: string };

      if (!response.ok || !("displayName" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Enregistrement impossible.",
        );
      }

      const nextProfile = {
        ...DEFAULT_OWNER_PROFILE,
        ...payload,
      };

      setOwnerProfile(nextProfile);
      setProfileDraft({
        displayName: nextProfile.displayName,
        jobTitle: nextProfile.jobTitle,
        avatarUrl: nextProfile.avatarUrl,
        aiBusinessContext: nextProfile.aiBusinessContext,
        aiAttentionKeywords: nextProfile.aiAttentionKeywords.join(", "),
      });
      writeBrowserCache(
        OWNER_PROFILE_CACHE_KEY,
        nextProfile,
        OWNER_PROFILE_CACHE_TTL_MS,
        {
          maxBytes: OWNER_PROFILE_CACHE_MAX_BYTES,
        },
      );
      setProfileStatusMessage("Profil mis a jour.");
    } catch (error) {
      setProfileErrorMessage(
        error instanceof Error ? error.message : "Enregistrement impossible.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  function handleManualGuidanceDraftChange(taskId: string, value: string) {
    setManualGuidanceDrafts((currentValue) => ({
      ...currentValue,
      [taskId]: value,
    }));
    setErrorMessage("");
    setStatusMessage("");
  }

  async function handleSubmitManualGuidance(task: ConversationManualAiTask) {
    if (!selectedConversation) {
      return;
    }

    const guidance = manualGuidanceDrafts[task.id]?.trim() || "";

    if (!guidance) {
      setErrorMessage("Ajoute le contexte manuel avant de lancer l IA.");
      setStatusMessage("");
      return;
    }

    setSubmittingManualTaskId(task.id);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await submitOwnerManualAiGuidance(selectedConversation.id, task.id, guidance);
      setManualGuidanceDrafts((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[task.id];
        return nextValue;
      });
      setStatusMessage("Contexte transmis. L IA a repris la conversation.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Reprise manuelle impossible.",
      );
    } finally {
      setSubmittingManualTaskId("");
    }
  }

  function handleProfileImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      setProfileErrorMessage("Le fichier doit etre une image.");
      setProfileStatusMessage("");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const nextValue =
        typeof reader.result === "string" ? reader.result : "";

      if (!nextValue) {
        setProfileErrorMessage("Lecture de l image impossible.");
        return;
      }

      setProfileDraft((currentValue) => ({
        ...currentValue,
        avatarUrl: nextValue,
      }));
      setProfileErrorMessage("");
      setProfileStatusMessage("Image prete a etre enregistree.");
    };

    reader.onerror = () => {
      setProfileErrorMessage("Lecture de l image impossible.");
      setProfileStatusMessage("");
    };

    reader.readAsDataURL(selectedFile);
    event.target.value = "";
  }

  function handleSelectConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setMobilePanel("thread");
    setErrorMessage("");
    setStatusMessage("");
    setAiErrorMessage("");
  }

  async function handleCopyRecoveryId() {
    if (!selectedRecoveryId) {
      setStatusMessage("ID de recuperation indisponible pour ce contact.");
      setErrorMessage("");
      return;
    }

    try {
      await copyText(selectedRecoveryId);
      setStatusMessage("ID de recuperation copie.");
      setErrorMessage("");
    } catch {
      setErrorMessage("Copie impossible sur cet appareil.");
    }
  }

  async function handleSendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    if (!selectedConversation) {
      setErrorMessage("Selectionne une conversation.");
      return;
    }

    if (!draft.trim()) {
      return;
    }

    setIsSendingReply(true);
    const nextDraft = draft.trim();
    setDraft("");
    const pendingMessage: ChatMessageRecord = {
      id: `pending-${createId()}`,
      sender: "owner",
      kind: "text",
      content: nextDraft,
      storageUrl: "",
      mimeType: "",
      fileName: "",
      fileSize: 0,
      durationMs: null,
      transcript: "",
      timestamp: new Date().toISOString(),
      deliveryStatus: "queued",
      replyTo: replyTarget,
    };
    setReplyTarget(null);
    setPendingOutgoingMessages((current) => [
      ...current,
      {
        conversationId: selectedConversation.id,
        message: pendingMessage,
      },
    ]);

    try {
      await sendOwnerMessage(
        selectedConversation.id,
        nextDraft,
        pendingMessage.replyTo,
      );
      setPendingOutgoingMessages((current) =>
        current.filter((entry) => entry.message.id !== pendingMessage.id),
      );
    } catch (error) {
      setPendingOutgoingMessages((current) =>
        current.filter((entry) => entry.message.id !== pendingMessage.id),
      );
      setDraft(nextDraft);
      setReplyTarget((current) => current || pendingMessage.replyTo || null);
      setErrorMessage(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setIsSendingReply(false);
    }
  }

  async function handleDeleteConversation() {
    if (!selectedConversation || isDeletingConversation) {
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Supprimer definitivement la discussion avec ${selectedConversation.clientName} ?`,
          );

    if (!confirmed) {
      return;
    }

    const deletedConversationId = selectedConversation.id;
    const nextConversationId =
      conversations.find((conversation) => conversation.id !== deletedConversationId)?.id || "";

    setErrorMessage("");
    setStatusMessage("");
    setIsDeletingConversation(true);

    try {
      await deleteOwnerConversation(deletedConversationId);
      setPendingOutgoingMessages((current) =>
        current.filter((entry) => entry.conversationId !== deletedConversationId),
      );
      setSelectedConversationId(nextConversationId);
      setMobilePanel(nextConversationId ? "thread" : "list");
      setStatusMessage("Discussion supprimee.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Suppression de la discussion impossible.",
      );
    } finally {
      setIsDeletingConversation(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selectedConversation || !messageId || deletingMessageId) {
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Supprimer ce message de la discussion ?");

    if (!confirmed) {
      return;
    }

    setDeletingMessageId(messageId);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await deleteOwnerMessage(selectedConversation.id, messageId);
      setPendingOutgoingMessages((current) =>
        current.filter((entry) => entry.message.id !== messageId),
      );
      setStatusMessage("Message supprime.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Suppression du message impossible.",
      );
    } finally {
      setDeletingMessageId("");
    }
  }

  function releaseRecorderResources() {
    recorderRef.current = null;
    recorderChunksRef.current = [];
    recordingStartedAtRef.current = null;

    if (recorderStreamRef.current) {
      recorderStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      recorderStreamRef.current = null;
    }
  }

  async function handleSendAttachment(file: File, forcedKind?: "voice") {
    if (!selectedConversation) {
      setErrorMessage("Selectionne une conversation.");
      return;
    }

    setErrorMessage("");
    setIsUploadingAttachment(true);
    const activeReplyTarget = replyTarget;

    try {
      const uploaded = await uploadChatAttachment(file, {
        kind: forcedKind,
        durationMs:
          forcedKind === "voice" && recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : null,
        ownerId: runtime.ownerId,
        conversationId: selectedConversation.id,
        actor: "owner",
      });

      await sendOwnerMessage(
        selectedConversation.id,
        toChatMessageDraftFromUpload(uploaded),
        activeReplyTarget,
      );
      setReplyTarget(null);
      setStatusMessage("Media envoye.");
    } catch (error) {
      setReplyTarget((current) => current || activeReplyTarget || null);
      setErrorMessage(error instanceof Error ? error.message : "Upload impossible.");
    } finally {
      setIsUploadingAttachment(false);
    }
  }

  function handleSelectAttachment() {
    attachmentInputRef.current?.click();
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    void handleSendAttachment(selectedFile);
  }

  async function handleToggleVoiceRecording() {
    if (isRecordingVoice) {
      recorderRef.current?.stop();
      return;
    }

    if (!selectedConversation) {
      setErrorMessage("Selectionne une conversation.");
      return;
    }

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setErrorMessage("Enregistrement indisponible.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    try {
      const stream = await requestMicrophoneStream();

      if (typeof MediaRecorder === "undefined") {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        setErrorMessage(
          "Ce navigateur ne prend pas en charge MediaRecorder pour les vocaux.",
        );
        return;
      }

      const recorder = new MediaRecorder(stream);

      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setIsRecordingVoice(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
            ? "m4a"
            : "webm";
        const audioBlob = new Blob(recorderChunksRef.current, {
          type: mimeType,
        });
        const audioFile = new File(
          [audioBlob],
          `voice-${Date.now()}.${extension}`,
          {
            type: mimeType,
          },
        );

        setIsRecordingVoice(false);
        void handleSendAttachment(audioFile, "voice");
        releaseRecorderResources();
      };

      recorder.onerror = () => {
        setIsRecordingVoice(false);
        setErrorMessage("Le message vocal n a pas pu etre enregistre.");
        releaseRecorderResources();
      };

      recorder.start();
      setStatusMessage("Enregistrement vocal en cours...");
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error.message : "";

      if (normalizedError === "MICROPHONE_API_UNAVAILABLE") {
        setErrorMessage(
          "Micro indisponible ici. Utilise HTTPS ou localhost pour declencher la permission micro.",
        );
        setStatusMessage("");
        releaseRecorderResources();
        return;
      }

      setIsRecordingVoice(false);
      setErrorMessage(getMicrophoneErrorMessage(error));
      setStatusMessage("");
      releaseRecorderResources();
    }
  }

  async function handleGenerateSuggestion() {
    setAiErrorMessage("");
    setAiSuggestion("");
    setAiMeta(null);

    if (!selectedConversation) {
      setAiErrorMessage("Selectionne une conversation avant d utiliser l IA.");
      return;
    }

    setIsGeneratingSuggestion(true);

    try {
      const aiContext = buildAiConversationRequestPayload(selectedConversation);
      const response = await fetch("/api/owner/ai/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          clientName: selectedConversation.clientName,
          aiMode: selectedConversation.aiMode,
          draft,
          conversationSettings: selectedConversation.aiSettings,
          conversationSummary: aiContext.conversationSummary,
          messages: aiContext.messages,
        }),
      });

      const payload = (await response.json()) as
        | SuggestionApiResponse
        | {
            error?: string;
          };

      if (!response.ok || !("suggestion" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Generation IA impossible.",
        );
      }

      setAiSuggestion(payload.suggestion);
      setAiMeta({
        model: payload.model,
        source: payload.source,
        rateLimit: payload.rateLimit,
      });
    } catch (error) {
      setAiErrorMessage(
        error instanceof Error ? error.message : "Generation IA impossible.",
      );
    } finally {
      setIsGeneratingSuggestion(false);
    }
  }

  function handleApplySuggestion() {
    if (!aiSuggestion) {
      return;
    }

    setDraft(aiSuggestion);
    setErrorMessage("");
  }

  function handleAiModeChange(nextMode: ChatConversationRecord["aiMode"]) {
    if (!selectedConversation) {
      return;
    }

    setConversationAiMode(selectedConversation.id, nextMode);

    if (nextMode === "auto") {
      void requestAutoReplyIfNeeded(selectedConversation.id);
    }
  }

  function handleSettingsFieldChange(
    field: keyof ConversationSettingsEditor,
    value: string | boolean,
  ) {
    setSettingsEditor((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      return {
        ...currentValue,
        [field]: value,
      } as ConversationSettingsEditor;
    });

    setSettingsErrorMessage("");
    setSettingsStatusMessage("");
  }

  function handleSaveConversationSettings() {
    if (!selectedConversation || !settingsEditor) {
      return;
    }

    const parsedMaxLength = Number.parseInt(settingsEditor.maxLength, 10);

    if (!Number.isFinite(parsedMaxLength)) {
      setSettingsErrorMessage("La longueur max doit etre un nombre valide.");
      setSettingsStatusMessage("");
      return;
    }

    updateConversationAiSettings(selectedConversation.id, {
      tone: settingsEditor.tone.trim() || "professionnel, rassurant, concis",
      personalContext: settingsEditor.personalContext.trim(),
      maxLength: parsedMaxLength,
      blacklistWords: settingsEditor.blacklistWords
        .split(",")
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
      scheduleEnabled: settingsEditor.scheduleEnabled,
      scheduleStart: settingsEditor.scheduleStart,
      scheduleEnd: settingsEditor.scheduleEnd,
      scheduleTimezone:
        settingsEditor.scheduleTimezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "UTC",
    });

    const refreshedSnapshot = getConversationSnapshot(selectedConversation.id);

    if (refreshedSnapshot?.conversation) {
      setSettingsEditor(createConversationSettingsEditor(refreshedSnapshot.conversation));
    }

    setSettingsStatusMessage("Parametres enregistres.");
    setSettingsErrorMessage("");
  }

  function handleOpenReportPicker() {
    if (!selectedConversation || !availableReportDateKeys.length) {
      setSettingsErrorMessage("Aucune date exploitable dans cette discussion.");
      setSettingsStatusMessage("");
      return;
    }

    setReportStartDateKey(availableReportDateKeys[0]);
    setReportEndDateKey(availableReportDateKeys.at(-1) || availableReportDateKeys[0]);
    setReportErrorMessage("");
    setReportData(null);
    setShowReportRangeModal(true);
    setShowReportResultModal(false);
  }

  async function handleGenerateConversationReport() {
    if (!selectedConversation) {
      setReportErrorMessage("Selectionne une conversation.");
      return;
    }

    if (!reportStartDateKey || !reportEndDateKey) {
      setReportErrorMessage("Selectionne une periode valide.");
      return;
    }

    if (reportStartDateKey > reportEndDateKey) {
      setReportErrorMessage("La date de debut doit etre avant la date de fin.");
      return;
    }

    const nextReport = buildConversationReport(
      selectedConversation.messages,
      reportStartDateKey,
      reportEndDateKey,
    );

    if (!nextReport) {
      setReportErrorMessage("Aucun message sur cette periode.");
      return;
    }

    setIsGeneratingReport(true);
    setReportErrorMessage("");

    try {
      const response = await fetch("/api/owner/ai/conversation-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          clientName: selectedConversation.clientName,
          startDateKey: reportStartDateKey,
          endDateKey: reportEndDateKey,
          messages: buildAiMessagePayload(nextReport.messages),
        }),
      });

      const payload = (await response.json()) as
        | ConversationReportApiResponse
        | {
            error?: string;
          };

      if (!response.ok || !("analysis" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Rapport IA indisponible.",
        );
      }

      setReportData({
        ...nextReport,
        aiAnalysis: payload.analysis,
        aiSource: payload.source,
        aiModel: payload.model,
      });
      setShowReportRangeModal(false);
      setShowReportResultModal(true);
    } catch (error) {
      setReportErrorMessage(
        error instanceof Error ? error.message : "Rapport IA indisponible.",
      );
    } finally {
      setIsGeneratingReport(false);
    }
  }

  const filterTabs: Array<
    | {
        id: InboxFilter;
        label: string;
      }
    | {
        label: string;
        href: string;
      }
  > = [
    { id: "all", label: "Toutes" },
    { id: "unread", label: "Non lues" },
    { label: "Statuts", href: "/dashboard/statuses" },
    { id: "drafts", label: "Brouillons" },
  ];
  const showInboxLoader =
    !hasCompletedInitialInboxSync && conversations.length === 0;
  const showThreadLoader =
    Boolean(selectedConversationId) &&
    (!selectedConversation ||
      (selectedConversation.threadHydrated === false &&
        selectedConversation.messages.length === 0)) &&
    isThreadSyncing;

  return (
    <main className="page-shell relative h-[100svh] overflow-hidden text-white md:min-h-dvh md:h-auto">
      <div className="relative mx-auto flex h-[100svh] w-full max-w-[1600px] flex-col px-0 py-0 md:min-h-dvh md:h-auto md:px-3 md:py-3">
        {activeFilter === "drafts" ? (
          <OwnerDraftsWorkspace
            onSelectFilter={setActiveFilter}
            onOpenStatuses={() => router.push("/dashboard/statuses")}
          />
        ) : (
          <section className="flex h-[100svh] overflow-hidden bg-transparent md:h-[calc(100dvh-1rem)] md:min-h-0 md:rounded-[1.8rem] md:border md:border-white/8 md:bg-black/10 md:shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <aside
            className={`${
              mobilePanel === "thread" ? "hidden lg:flex" : "flex"
            } w-full shrink-0 flex-col bg-[#111b21]/94 backdrop-blur-sm lg:w-[390px] lg:border-r lg:border-white/8`}
          >
            <div className="flex items-center justify-between px-4 pb-3 pt-4 md:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Inbox
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100">
                    {inboxStats.threadCount} conversations
                  </p>
                  {isInboxSyncing ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                      <LoaderCircle className="size-3 animate-spin" />
                      Sync
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGeneralSettings(true)}
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Ouvrir les parametres generaux"
              >
                <MoreVertical className="size-4.5" />
              </button>
            </div>

            <div className="px-4 md:px-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Rechercher ou demarrer une discussion"
                  className="w-full rounded-full border border-white/6 bg-white/[0.06] py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                />
              </label>
            </div>

            <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-3 md:px-5">
              {filterTabs.map((tab) => (
                "id" in tab ? (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeFilter === tab.id
                        ? "bg-emerald-500/18 text-emerald-200"
                        : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ) : (
                  <button
                    key={tab.href}
                    type="button"
                    onClick={() => router.push(tab.href)}
                    className="shrink-0 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
                  >
                    {tab.label}
                  </button>
                )
              ))}
            </div>

            <div
              ref={conversationListViewportRef}
              onScroll={handleConversationListScroll}
              className="hide-scrollbar flex-1 overflow-y-auto"
            >
              <div className="space-y-0.5 px-2 pb-3">
                {showInboxLoader ? (
                  <div className="space-y-3 px-3 py-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-300">
                      <LoaderCircle className="size-3.5 animate-spin" />
                      Chargement des conversations...
                    </div>
                    <div className="loading-bar w-full" />
                    <div className="loading-bar w-5/6" />
                    <div className="loading-bar w-full" />
                  </div>
                ) : visibleConversations.length ? (
                  renderedConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => handleSelectConversation(conversation.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        selectedConversationId === conversation.id
                          ? "bg-white/[0.08]"
                          : "hover:bg-white/[0.045]"
                      }`}
                    >
                      <div
                        className={`mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarTone(
                          conversation.clientName,
                        )} text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]`}
                      >
                        {getInitials(conversation.clientName)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-100">
                            {conversation.clientName}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {formatListTime(conversation.updatedAt)}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-2">
                          <p className="line-clamp-1 text-xs leading-relaxed text-slate-400">
                            {getMessagePreview(conversation, ownerDisplayName)}
                          </p>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              IA {conversation.aiMode}
                            </span>
                            {conversation.pendingManualTaskCount ? (
                              <span className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                                Contexte IA
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {conversation.pendingManualTaskCount ? (
                              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-[#2c1602]">
                                {conversation.pendingManualTaskCount}
                              </span>
                            ) : null}
                            {conversation.unreadOwnerCount ? (
                              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-bold text-[#052019]">
                                {conversation.unreadOwnerCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-12 text-center">
                    <p className="text-sm font-medium text-slate-300">
                      Aucune conversation visible
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      Attends un nouveau message ou change le filtre.
                    </p>
                  </div>
                )}

                {hiddenConversationCount > 0 ? (
                  <div className="px-3 py-4">
                    <button
                      type="button"
                      onClick={loadMoreConversations}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
                    >
                      <MessageSquareMore className="size-3.5" />
                      Charger {Math.min(hiddenConversationCount, CONVERSATION_LIST_RENDER_STEP)} conversations de plus
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <section
            className={`${
              mobilePanel === "thread" ? "flex" : "hidden"
            } relative min-w-0 flex-1 flex-col lg:flex`}
          >
            {selectedConversation ? (
              <>
                <header className="flex items-center gap-3 border-b border-white/8 bg-[#111b21]/92 px-3 py-3 backdrop-blur-sm md:px-4">
                  <button
                    type="button"
                    onClick={() => setMobilePanel("list")}
                    className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
                    aria-label="Retour a la liste"
                  >
                    <ArrowLeft className="size-4.5" />
                  </button>

                  <div
                    className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarTone(
                      selectedConversation.clientName,
                    )} text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)]`}
                  >
                    {getInitials(selectedConversation.clientName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-slate-100 md:text-base">
                      {selectedConversation.clientName}
                    </h2>
                    <p className="truncate text-xs text-slate-400">
                      {selectedConversation.autoReplyPending
                        ? "Reponse automatique en cours"
                        : "Conversation active"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDeleteConversation()}
                    disabled={isDeletingConversation}
                    className="hidden size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex"
                    aria-label="Supprimer la discussion"
                  >
                    {isDeletingConversation ? (
                      <LoaderCircle className="size-4.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-4.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    className="hidden size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white md:inline-flex"
                    aria-label="Rechercher dans la conversation"
                  >
                    <Search className="size-4.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowConversationSettings(true)}
                    className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label="Ouvrir les parametres du contact"
                  >
                    <Settings2 className="size-4.5" />
                  </button>

                  <div ref={conversationMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setShowConversationMenu((currentValue) => !currentValue)
                      }
                      className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                      aria-label="Ouvrir le menu de conversation"
                      aria-expanded={showConversationMenu}
                    >
                      <MoreVertical className="size-4.5" />
                    </button>

                    {showConversationMenu ? (
                      <div className="absolute right-0 top-[calc(100%+0.65rem)] z-30 w-72 rounded-[1.2rem] border border-white/10 bg-[#111b21]/96 p-2 shadow-[0_24px_50px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                        <div className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            ID de recuperation
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              void handleCopyRecoveryId();
                              setShowConversationMenu(false);
                            }}
                            className="mt-2 flex w-full items-center gap-2 rounded-[0.95rem] border border-white/10 bg-white/[0.05] px-3 py-2 text-left transition-colors hover:bg-white/[0.08]"
                          >
                            <Copy className="size-3.5 shrink-0 text-emerald-100" />
                            <span className="truncate text-sm font-semibold text-emerald-100">
                              {selectedRecoveryId || "ID indisponible"}
                            </span>
                          </button>
                        </div>

                        <div className="mt-2 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowConversationMenu(false);
                              setShowConversationSettings(true);
                            }}
                            className="flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
                          >
                            <Settings2 className="size-4 shrink-0 text-slate-400" />
                            Parametres du contact
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowConversationMenu(false);
                              void handleDeleteConversation();
                            }}
                            disabled={isDeletingConversation}
                            className="flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-2.5 text-left text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/12 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeletingConversation ? (
                              <LoaderCircle className="size-4 shrink-0 animate-spin text-rose-200" />
                            ) : (
                              <Trash2 className="size-4 shrink-0 text-rose-200" />
                            )}
                            Supprimer la discussion
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </header>

                {pendingManualTasks.length ? (
                  <div className="border-b border-amber-300/12 bg-amber-400/10 px-3 py-2 text-sm text-amber-50 md:px-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-black/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                      <MessageSquareMore className="size-3.5" />
                      {pendingManualTasks.length} intervention{pendingManualTasks.length > 1 ? "s" : ""} IA en attente
                    </div>
                  </div>
                ) : null}

                <div
                  ref={threadViewportRef}
                  className="hide-scrollbar flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6"
                >
                  {showThreadLoader ? (
                    <div className="mx-auto flex h-full min-h-64 w-full max-w-3xl flex-col justify-center gap-3">
                      <div className="loading-bar w-32" />
                      <div className="loading-bar w-2/3" />
                      <div className="ml-auto loading-bar w-1/2" />
                      <div className="loading-bar w-3/4" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {hiddenMessageCount > 0 ? (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleThreadMessageCount((currentValue) =>
                                Math.min(
                                  totalDisplayedMessageCount,
                                  currentValue + THREAD_MESSAGE_RENDER_STEP,
                                ),
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
                          >
                            <MessageSquareMore className="size-3.5" />
                            Charger {Math.min(hiddenMessageCount, THREAD_MESSAGE_RENDER_STEP)} messages plus anciens
                          </button>
                        </div>
                      ) : null}
                      {messageGroups.map((group) => (
                        <div key={group.label} className="space-y-3">
                          <div className="flex justify-center">
                            <span className="rounded-full border border-white/8 bg-[#182229]/85 px-3 py-1 text-[11px] font-semibold text-slate-300 shadow-[0_8px_18px_rgba(0,0,0,0.25)]">
                              {group.label}
                            </span>
                          </div>

                          {group.items.map((message) => {
                            const manualTask = pendingManualTaskByMessageId.get(message.id);
                            const isSwiping = activeSwipeMessageId === message.id;
                            const replySenderLabel =
                              message.replyTo?.sender === "client"
                                ? selectedConversation.clientName
                                : ownerDisplayName;

                            return (
                              <div
                                key={message.id}
                                className={`relative space-y-2 ${
                                  message.sender === "owner" || message.sender === "ai"
                                    ? "ml-auto max-w-[86%]"
                                    : "mr-auto max-w-[86%]"
                                }`}
                              >
                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-200 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                                    <Reply className="size-4" />
                                  </span>
                                </div>
                                <article
                                  data-owner-message-id={message.id}
                                  onContextMenu={(event) => handleMessageContextMenu(event, message)}
                                  onTouchStart={(event) => handleMessageTouchStart(event, message)}
                                  onTouchMove={handleMessageTouchMove}
                                  onTouchEnd={() => handleMessageTouchEnd(message)}
                                  onTouchCancel={() => handleMessageTouchEnd(message)}
                                  className={`relative rounded-[0.9rem] px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-[transform,box-shadow,border-color] duration-150 md:px-4 md:py-3 ${
                                    message.sender === "owner" || message.sender === "ai"
                                      ? "rounded-br-sm bg-[#005c4b] text-white"
                                      : "rounded-bl-sm bg-[#202c33]/95 text-slate-100"
                                  } ${
                                    highlightedMessageId === message.id
                                      ? "ring-2 ring-emerald-300/55"
                                      : ""
                                  }`}
                                  style={{
                                    transform:
                                      isSwiping && activeSwipeOffset
                                        ? `translateX(${activeSwipeOffset}px)`
                                        : "translateX(0px)",
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300/80">
                                    <div className="flex items-center gap-2">
                                      <UserRound className="size-3" />
                                      {message.sender === "client"
                                        ? selectedConversation.clientName
                                        : ownerDisplayName}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteMessage(message.id)}
                                      disabled={
                                        deletingMessageId === message.id || isDeletingConversation
                                      }
                                      className="inline-flex size-6 items-center justify-center rounded-full text-slate-300/75 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                      aria-label="Supprimer le message"
                                    >
                                      {deletingMessageId === message.id ? (
                                        <LoaderCircle className="size-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-3" />
                                      )}
                                    </button>
                                  </div>
                                  {message.replyTo ? (
                                    <button
                                      type="button"
                                      onClick={() => jumpToThreadMessage(message.replyTo!.messageId)}
                                      className="mt-2 block w-full rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-left transition-colors hover:bg-black/25"
                                    >
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/85">
                                        Reponse a {replySenderLabel}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-slate-200/90">
                                        {getReplyPreviewText(message.replyTo)}
                                      </p>
                                    </button>
                                  ) : null}
                                  {renderMessageBody(message)}
                                  <div className="mt-1.5 flex items-center justify-end gap-2">
                                    {message.deliveryStatus === "queued" ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-100/85">
                                        <LoaderCircle className="size-3 animate-spin" />
                                        Envoi...
                                      </span>
                                    ) : null}
                                    <span className="text-[10px] text-slate-300/75">
                                      {formatBubbleTime(message.timestamp)}
                                    </span>
                                  </div>
                                </article>

                                {manualTask ? (
                                  <div className="rounded-[1rem] border border-amber-300/18 bg-amber-400/10 px-3 py-3 text-left text-sm text-amber-50 shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/90">
                                      Intervention IA requise
                                    </p>
                                    <p className="mt-2 leading-relaxed text-amber-50/95">
                                      {manualTask.reason === "keyword" && manualTask.keyword
                                        ? `Le client a utilise le mot-cle "${manualTask.keyword}". Dis a l IA quoi repondre.`
                                        : `Le client a envoye un ${getManualAiMessageKindLabel(
                                            manualTask.messageKind,
                                          )}. Decris a l IA ce qu il contient pour qu elle puisse repondre.`}
                                    </p>
                                    <textarea
                                      value={manualGuidanceDrafts[manualTask.id] || ""}
                                      onChange={(event) =>
                                        handleManualGuidanceDraftChange(
                                          manualTask.id,
                                          event.target.value,
                                        )
                                      }
                                      className="mt-3 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-amber-100/45 focus:border-amber-300/35"
                                      placeholder="Ex: Le client demande le prix du pack vitrine. Reponds 250 USD avec possibilite d options supplementaires..."
                                    />
                                    <div className="mt-3 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => void handleSubmitManualGuidance(manualTask)}
                                        disabled={
                                          submittingManualTaskId === manualTask.id ||
                                          isDeletingConversation
                                        }
                                        className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-[#2c1602] transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {submittingManualTaskId === manualTask.id ? (
                                          <LoaderCircle className="size-3.5 animate-spin" />
                                        ) : null}
                                        Lancer l IA avec ce contexte
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {showScrollToLatestButton ? (
                  <button
                    type="button"
                    onClick={scrollThreadToLatestMessage}
                    className="absolute bottom-[5.8rem] right-4 z-20 inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-[#111b21]/92 text-slate-100 shadow-[0_18px_36px_rgba(0,0,0,0.34)] transition-colors hover:bg-[#182229] md:bottom-24"
                    aria-label="Aller au dernier message"
                  >
                    <ArrowDown className="size-4.5" />
                  </button>
                ) : null}

                <div className="border-t border-white/8 bg-[#111b21]/90 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm md:px-3 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  {isSendingReply || isUploadingAttachment || isDeletingConversation ? (
                    <p className="mb-2 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
                      <LoaderCircle className="size-4 animate-spin" />
                      {isDeletingConversation
                        ? "Suppression de la discussion..."
                        : isUploadingAttachment
                          ? "Upload en cours..."
                          : "Message en cours d envoi..."}
                    </p>
                  ) : null}

                  {aiErrorMessage ? (
                    <p className="mb-2 rounded-2xl bg-rose-500/12 px-4 py-2 text-sm text-rose-100">
                      {aiErrorMessage}
                    </p>
                  ) : null}

                  {errorMessage ? (
                    <p className="mb-2 rounded-2xl bg-rose-500/12 px-4 py-2 text-sm text-rose-100">
                      {errorMessage}
                    </p>
                  ) : null}

                  {statusMessage ? (
                    <p className="mb-2 rounded-2xl bg-emerald-500/12 px-4 py-2 text-sm text-emerald-100">
                      {statusMessage}
                    </p>
                  ) : null}

                  {aiSuggestion ? (
                    <div className="mb-2 rounded-2xl border border-emerald-400/12 bg-emerald-500/8 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                          Suggestion IA
                        </p>
                        {aiMeta ? (
                          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            {aiMeta.source} • {aiMeta.rateLimit.remaining}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-100">
                        {aiSuggestion}
                      </p>
                      <button
                        type="button"
                        onClick={handleApplySuggestion}
                        className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/18 px-3 py-1.5 text-xs font-semibold text-emerald-100"
                      >
                        <Sparkles className="size-3.5" />
                        Utiliser
                      </button>
                    </div>
                  ) : null}

                  <form onSubmit={handleSendReply}>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      onChange={handleAttachmentInputChange}
                      className="hidden"
                      accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar,.xls,.xlsx,.ppt,.pptx"
                    />

                    {replyTarget ? (
                      <div className="mb-2 flex items-start justify-between gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => jumpToThreadMessage(replyTarget.messageId)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/85">
                            Reponse a {replyTarget.sender === "client" ? selectedConversation.clientName : ownerDisplayName}
                          </p>
                          <p className="mt-1 truncate text-sm text-slate-200">
                            {getReplyPreviewText(replyTarget)}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyTarget(null)}
                          className="inline-flex size-8 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                          aria-label="Annuler la reponse"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : null}

                    <div className="flex items-end gap-2 rounded-[1.8rem] border border-white/10 bg-[#202c33]/94 px-2 py-2 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
                      <button
                        type="button"
                        onClick={handleGenerateSuggestion}
                        disabled={isGeneratingSuggestion}
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Generer une suggestion IA"
                      >
                        <Sparkles className="size-4.5" />
                      </button>

                      <button
                        type="button"
                        onClick={handleSelectAttachment}
                        disabled={isUploadingAttachment || isSendingReply || isRecordingVoice}
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Joindre un fichier"
                      >
                        {isUploadingAttachment ? (
                          <LoaderCircle className="size-4.5 animate-spin" />
                        ) : (
                          <Paperclip className="size-4.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleVoiceRecording()}
                        disabled={isUploadingAttachment || isSendingReply}
                        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          isRecordingVoice
                            ? "bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        }`}
                        aria-label={
                          isRecordingVoice
                            ? "Arreter l enregistrement vocal"
                            : "Envoyer un message vocal"
                        }
                      >
                        {isRecordingVoice ? (
                          <Square className="size-4.5" />
                        ) : (
                          <Mic className="size-4.5" />
                        )}
                      </button>

                      <label className="block flex-1">
                        <span className="sr-only">Reponse</span>
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          className="max-h-36 min-h-10 w-full resize-none bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-slate-400"
                          placeholder="Entrez un message"
                          rows={1}
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={isSendingReply || isUploadingAttachment || isRecordingVoice}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#005c4b] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Envoyer"
                      >
                        {isSendingReply ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <SendHorizontal className="size-4" />
                        )}
                        {isSendingReply ? "Envoi..." : "Envoyer"}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <MessageSquareMore className="size-10 text-slate-600" />
                <p className="mt-4 text-sm font-medium text-slate-300">
                  Selectionne une conversation.
                </p>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                  Les personnes qui t ecrivent apparaitront dans la colonne de gauche.
                </p>
              </div>
            )}
          </section>
          </section>
        )}
      </div>

      {messageContextMenu && contextMenuMessage ? (
        <div
          className="fixed z-40 min-w-48 rounded-[1.1rem] border border-white/10 bg-[#111b21]/96 p-2 shadow-[0_24px_50px_rgba(0,0,0,0.38)] backdrop-blur-xl"
          style={{
            left:
              typeof window === "undefined"
                ? messageContextMenu.x
                : Math.min(messageContextMenu.x, window.innerWidth - 220),
            top:
              typeof window === "undefined"
                ? messageContextMenu.y
                : Math.min(messageContextMenu.y, window.innerHeight - 90),
          }}
        >
          <button
            type="button"
            onClick={() => beginReplyToMessage(contextMenuMessage)}
            className="flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
          >
            <Reply className="size-4 shrink-0 text-slate-300" />
            Repondre
          </button>
        </div>
      ) : null}

      {shouldLoadOwnerModals ? (
        <OwnerDashboardModals
          showGeneralSettings={showGeneralSettings}
          showConversationSettings={showConversationSettings}
          showReportRangeModal={showReportRangeModal}
          showReportResultModal={showReportResultModal}
          ownerDisplayName={ownerDisplayName}
          ownerJobTitle={ownerJobTitle}
          profileDraft={profileDraft}
          profileErrorMessage={profileErrorMessage}
          profileStatusMessage={profileStatusMessage}
          isSavingProfile={isSavingProfile}
          inboxStats={inboxStats}
          onCloseGeneralSettings={() => setShowGeneralSettings(false)}
          onOpenDrafts={() => {
            setShowGeneralSettings(false);
            setActiveFilter("drafts");
          }}
          onOpenStatuses={() => {
            setShowGeneralSettings(false);
            router.push("/dashboard/statuses");
          }}
          onProfileFieldChange={handleProfileFieldChange}
          onProfileImageUpload={handleProfileImageUpload}
          onSaveOwnerProfile={() => void handleSaveOwnerProfile()}
          selectedConversation={selectedConversation}
          settingsEditor={settingsEditor}
          settingsErrorMessage={settingsErrorMessage}
          settingsStatusMessage={settingsStatusMessage}
          onCloseConversationSettings={() => setShowConversationSettings(false)}
          onAiModeChange={handleAiModeChange}
          onSettingsFieldChange={handleSettingsFieldChange}
          onOpenReportPicker={handleOpenReportPicker}
          onSaveConversationSettings={handleSaveConversationSettings}
          availableReportDateOptions={availableReportDateOptions}
          reportStartDateKey={reportStartDateKey}
          reportEndDateKey={reportEndDateKey}
          reportErrorMessage={reportErrorMessage}
          isGeneratingReport={isGeneratingReport}
          onCloseReportRangeModal={() => setShowReportRangeModal(false)}
          onReportStartDateChange={handleReportStartDateChange}
          onReportEndDateChange={handleReportEndDateChange}
          onGenerateConversationReport={() => void handleGenerateConversationReport()}
          reportData={reportData}
          reportStartDateLabel={
            reportData ? formatReportDateLabel(reportData.startDateKey) : ""
          }
          reportEndDateLabel={
            reportData ? formatReportDateLabel(reportData.endDateKey) : ""
          }
          reportMessageGroups={reportMessageGroups}
          onCloseReportResultModal={() => setShowReportResultModal(false)}
        />
      ) : null}
    </main>
  );
}
