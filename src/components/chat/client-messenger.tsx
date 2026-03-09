"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Mic,
  KeyRound,
  LoaderCircle,
  MessageSquareMore,
  Paperclip,
  SendHorizontal,
  Shield,
  Square,
  UserRound,
  X,
} from "lucide-react";

import {
  clearClientChatSession,
  getChatRuntimeConfig,
  getClientConversationSnapshot,
  initializeClientConversationAccess,
  markConversationSeen,
  recoverClientConversation,
  requestAutoReplyIfNeeded,
  sendClientMessage,
  setClientConversationSecurityCode,
  syncClientConversationState,
  subscribeToChatSnapshots,
  type ChatConversationRecord,
  type ChatMessageRecord,
  type ClientChatSession,
} from "@/lib/chat";
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

type OwnerProfile = {
  ownerId: string;
  displayName: string;
  jobTitle: string;
  avatarUrl: string;
  updatedAt: string;
};

type OnboardingStep = "none" | "name" | "recover" | "welcome" | "security";
type PublicStatusesPayload = {
  statuses: Array<{
    id: string;
  }>;
};

const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  ownerId: "vichly-owner",
  displayName:
    process.env.NEXT_PUBLIC_OWNER_DISPLAY_NAME || "Toussaint Leo Vitch",
  jobTitle: process.env.NEXT_PUBLIC_OWNER_JOB_TITLE || "Entrepreneur",
  avatarUrl: process.env.NEXT_PUBLIC_OWNER_AVATAR_URL || "",
  updatedAt: "",
};
const STATUS_SEEN_STORAGE_KEY = "vichly_seen_status_ids";
const PUBLIC_OWNER_PROFILE_CACHE_NAMESPACE = "vichly_public_owner_profile_cache";
const PUBLIC_OWNER_PROFILE_CACHE_KEY = createBrowserCacheKey(
  PUBLIC_OWNER_PROFILE_CACHE_NAMESPACE,
);
const PUBLIC_OWNER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_OWNER_PROFILE_CACHE_MAX_BYTES = 12_000;
const PUBLIC_STATUSES_CACHE_NAMESPACE = "vichly_public_statuses_cache";
const PUBLIC_STATUSES_CACHE_KEY = createBrowserCacheKey(PUBLIC_STATUSES_CACHE_NAMESPACE);
const PUBLIC_STATUSES_CACHE_TTL_MS = 60 * 1000;
const PUBLIC_STATUSES_CACHE_MAX_BYTES = 24_000;
const CLIENT_SYNC_INTERVAL_MS = 8_000;
const STATUS_REFRESH_INTERVAL_MS = 60_000;
const THREAD_MESSAGE_RENDER_LIMIT = 120;
const THREAD_MESSAGE_RENDER_STEP = 120;
const SCROLL_TO_LATEST_THRESHOLD_PX = 96;

function formatMessageTime(timestamp: string) {
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

function formatDayLabel(timestamp: string) {
  const targetDate = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  const diffInDays = Math.round(
    (today.getTime() - targetDay.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffInDays === 0) {
    return "Aujourd'hui";
  }

  if (diffInDays === 1) {
    return "Hier";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(targetDate);
}

function buildMessageGroups(messages: ChatConversationRecord["messages"]) {
  const groups: Array<{
    dayKey: string;
    dayLabel: string;
    messages: ChatConversationRecord["messages"];
  }> = [];

  messages.forEach((message) => {
    const targetDate = new Date(message.timestamp);
    const dayKey = `${targetDate.getFullYear()}-${targetDate.getMonth()}-${targetDate.getDate()}`;
    const lastGroup = groups.at(-1);

    if (!lastGroup || lastGroup.dayKey !== dayKey) {
      groups.push({
        dayKey,
        dayLabel: formatDayLabel(message.timestamp),
        messages: [message],
      });
      return;
    }

    lastGroup.messages.push(message);
  });

  return groups;
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

function renderMessageBody(message: ChatConversationRecord["messages"][number]) {
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

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "TV";
  }

  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function readSeenStatusIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(STATUS_SEEN_STORAGE_KEY);

    if (!rawValue) {
      return new Set<string>();
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return new Set<string>();
    }

    return new Set(
      parsedValue.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ),
    );
  } catch {
    return new Set<string>();
  }
}

export default function ClientMessenger() {
  const runtime = getChatRuntimeConfig();
  const [conversation, setConversation] = useState<ChatConversationRecord | null>(
    null,
  );
  const [session, setSession] = useState<ClientChatSession | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(
    DEFAULT_OWNER_PROFILE,
  );
  const [clientName, setClientName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [recoverDiscussionId, setRecoverDiscussionId] = useState("");
  const [recoverSecurityCode, setRecoverSecurityCode] = useState("");
  const [securityCodeDraft, setSecurityCodeDraft] = useState("");
  const [pendingDiscussionId, setPendingDiscussionId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingTextSendCount, setPendingTextSendCount] = useState(0);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isPreparingSession, setIsPreparingSession] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [isConversationSyncing, setIsConversationSyncing] = useState(false);
  const [hasCompletedInitialConversationSync, setHasCompletedInitialConversationSync] =
    useState(false);
  const [visibleMessageCount, setVisibleMessageCount] = useState(
    THREAD_MESSAGE_RENDER_LIMIT,
  );
  const [hasResolvedInitialState, setHasResolvedInitialState] = useState(false);
  const [isRestoringSavedSession, setIsRestoringSavedSession] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("none");
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [hasUnreadStatuses, setHasUnreadStatuses] = useState(false);
  const [showScrollToLatestButton, setShowScrollToLatestButton] = useState(false);
  const [pendingOutgoingMessages, setPendingOutgoingMessages] = useState<
    ChatMessageRecord[]
  >([]);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const conversationSyncAbortRef = useRef<AbortController | null>(null);
  const statusRefreshAbortRef = useRef<AbortController | null>(null);
  const lastAutoReplyRequestRef = useRef("");
  const shouldStickThreadToBottomRef = useRef(true);
  const lastScrolledConversationIdRef = useRef("");
  const isTextSendPending = pendingTextSendCount > 0;

  useEffect(() => {
    let isActive = true;
    let initialStateResolved = false;

    const refreshSnapshot = () => {
      if (!isActive) {
        return;
      }

      const snapshot = getClientConversationSnapshot(runtime.ownerId);

      setConversation(snapshot.conversation);
      setSession(snapshot.session);

      if (snapshot.session?.clientName) {
        setClientName(snapshot.session.clientName);
        setNameDraft(snapshot.session.clientName);
      }

      if (!initialStateResolved) {
        setOnboardingStep(snapshot.session ? "none" : "name");
        setHasResolvedInitialState(true);
        initialStateResolved = true;
      }
    };

    const bootstrapSession = async () => {
      const snapshot = getClientConversationSnapshot(runtime.ownerId);

      if (!snapshot.session) {
        refreshSnapshot();
        return;
      }

      setIsRestoringSavedSession(true);

      try {
        await syncClientConversationState(runtime.ownerId, {
          forceFullSync: true,
        });
      } finally {
        if (!isActive) {
          return;
        }

        setIsRestoringSavedSession(false);
        refreshSnapshot();
      }
    };

    void bootstrapSession();

    const unsubscribe = subscribeToChatSnapshots(() => {
      refreshSnapshot();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [runtime.ownerId]);

  useEffect(() => {
    if (!hasResolvedInitialState) {
      return;
    }

    let syncIntervalId = 0;

    const runSync = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (conversationSyncAbortRef.current) {
        return;
      }

      setIsConversationSyncing(true);
      const controller = new AbortController();
      conversationSyncAbortRef.current = controller;
      void syncClientConversationState(runtime.ownerId, {
        signal: controller.signal,
      }).finally(() => {
        if (conversationSyncAbortRef.current === controller) {
          conversationSyncAbortRef.current = null;
        }
        setIsConversationSyncing(false);
        setHasCompletedInitialConversationSync(true);
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
      }, CLIENT_SYNC_INTERVAL_MS);
    };

    const onWindowFocus = () => {
      runSync();
      refreshPollingWindow();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runSync();
      } else {
        conversationSyncAbortRef.current?.abort();
        conversationSyncAbortRef.current = null;
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
      conversationSyncAbortRef.current?.abort();
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasResolvedInitialState, runtime.ownerId]);

  useEffect(() => {
    removeOutdatedBrowserCacheVersions(PUBLIC_OWNER_PROFILE_CACHE_NAMESPACE);
    const cachedProfile = readBrowserCache<OwnerProfile>(PUBLIC_OWNER_PROFILE_CACHE_KEY);

    if (cachedProfile) {
      setOwnerProfile({
        ...DEFAULT_OWNER_PROFILE,
        ...cachedProfile,
      });
    }

    async function loadOwnerProfile() {
      try {
        const response = await fetch("/api/profile", {
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
        writeBrowserCache(
          PUBLIC_OWNER_PROFILE_CACHE_KEY,
          nextProfile,
          PUBLIC_OWNER_PROFILE_CACHE_TTL_MS,
          {
            maxBytes: PUBLIC_OWNER_PROFILE_CACHE_MAX_BYTES,
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
    removeOutdatedBrowserCacheVersions(PUBLIC_STATUSES_CACHE_NAMESPACE);
    const cachedStatuses = readBrowserCache<PublicStatusesPayload>(PUBLIC_STATUSES_CACHE_KEY);

    if (cachedStatuses) {
      const seenIds = readSeenStatusIds();
      setHasUnreadStatuses(
        cachedStatuses.statuses.some((status) => !seenIds.has(status.id)),
      );
    }

    async function refreshStatusAwareness() {
      if (statusRefreshAbortRef.current) {
        return;
      }

      const controller = new AbortController();

      try {
        statusRefreshAbortRef.current = controller;
        const response = await fetch("/api/statuses", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          if (controller.signal.aborted) {
            return;
          }
          setHasUnreadStatuses(false);
          return;
        }

        const payload = (await response.json()) as PublicStatusesPayload;
        writeBrowserCache(
          PUBLIC_STATUSES_CACHE_KEY,
          payload,
          PUBLIC_STATUSES_CACHE_TTL_MS,
          {
            maxBytes: PUBLIC_STATUSES_CACHE_MAX_BYTES,
          },
        );
        const seenIds = readSeenStatusIds();
        const hasPendingStatus = payload.statuses.some(
          (status) => !seenIds.has(status.id),
        );

        setHasUnreadStatuses(hasPendingStatus);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setHasUnreadStatuses(false);
      } finally {
        if (statusRefreshAbortRef.current === controller) {
          statusRefreshAbortRef.current = null;
        }
      }
    }

    const cancelIdleLoad = runWhenBrowserIdle(() => {
      void refreshStatusAwareness();
    });
    let intervalId = 0;

    const refreshPollingWindow = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = 0;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      intervalId = window.setInterval(() => {
        void refreshStatusAwareness();
      }, STATUS_REFRESH_INTERVAL_MS);
    };

    const handleFocus = () => {
      void refreshStatusAwareness();
      refreshPollingWindow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshStatusAwareness();
      } else {
        statusRefreshAbortRef.current?.abort();
        statusRefreshAbortRef.current = null;
      }
      refreshPollingWindow();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    refreshPollingWindow();

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      cancelIdleLoad();
      statusRefreshAbortRef.current?.abort();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (conversation?.unreadClientCount) {
      markConversationSeen(conversation.id, "client");
    }
  }, [conversation?.id, conversation?.unreadClientCount]);

  useEffect(() => {
    const conversationId = conversation?.id ?? "";
    const lastMessage = conversation?.messages.at(-1);
    const nextAutoReplyMessageId =
      conversationId &&
      conversation.aiMode === "auto" &&
      lastMessage?.sender === "client"
        ? lastMessage.id
        : "";

    if (nextAutoReplyMessageId && lastAutoReplyRequestRef.current !== nextAutoReplyMessageId) {
      lastAutoReplyRequestRef.current = nextAutoReplyMessageId;
      void requestAutoReplyIfNeeded(conversationId);
    }

    if (!nextAutoReplyMessageId) {
      lastAutoReplyRequestRef.current = "";
    }
  }, [conversation?.aiMode, conversation?.id, conversation?.messages, conversation?.updatedAt]);

  useEffect(() => {
    setVisibleMessageCount(THREAD_MESSAGE_RENDER_LIMIT);
  }, [conversation?.id]);

  const renderedMessages = useMemo(() => {
    const allMessages = [
      ...(conversation?.messages || []),
      ...pendingOutgoingMessages,
    ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    if (allMessages.length <= visibleMessageCount) {
      return allMessages;
    }

    return allMessages.slice(-visibleMessageCount);
  }, [conversation?.messages, pendingOutgoingMessages, visibleMessageCount]);

  const totalDisplayedMessageCount =
    (conversation?.messages.length || 0) + pendingOutgoingMessages.length;
  const hiddenMessageCount =
    totalDisplayedMessageCount > renderedMessages.length
      ? totalDisplayedMessageCount - renderedMessages.length
      : 0;

  const messageGroups = useMemo(
    () => buildMessageGroups(renderedMessages),
    [renderedMessages],
  );

  const visibleDiscussionId = session?.clientKey || pendingDiscussionId || "Nouveau";
  const showConversationLoader =
    Boolean(session) &&
    (!conversation ||
      (conversation.threadHydrated === false && conversation.messages.length === 0)) &&
    pendingOutgoingMessages.length === 0 &&
    (!hasCompletedInitialConversationSync || isConversationSyncing);
  const latestRenderedMessageId = renderedMessages.at(-1)?.id || "";

  useEffect(() => {
    const viewport = messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    const currentConversationId = conversation?.id || "";
    const shouldAutoScroll =
      lastScrolledConversationIdRef.current !== currentConversationId ||
      shouldStickThreadToBottomRef.current;

    lastScrolledConversationIdRef.current = currentConversationId;

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
  }, [conversation?.id, renderedMessages.length, latestRenderedMessageId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;

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
  }, [conversation?.id, renderedMessages.length]);

  function scrollToLatestMessage() {
    const viewport = messagesViewportRef.current;

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

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    const nextDraft = draft.trim();

    if (!nextDraft) {
      return;
    }

    if (!clientName.trim()) {
      setOnboardingStep("name");
      setErrorMessage("Entre ton nom avant d'envoyer un message.");
      return;
    }

    setDraft("");
    setPendingTextSendCount((current) => current + 1);
    const pendingMessage: ChatMessageRecord = {
      id: `pending-${createId()}`,
      sender: "client",
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
    };
    setPendingOutgoingMessages((current) => [...current, pendingMessage]);

    try {
      await sendClientMessage(runtime.ownerId, clientName, nextDraft);
      setPendingOutgoingMessages((current) =>
        current.filter((message) => message.id !== pendingMessage.id),
      );
      setStatusMessage("Message envoye.");
    } catch (error) {
      setPendingOutgoingMessages((current) =>
        current.filter((message) => message.id !== pendingMessage.id),
      );
      setDraft((current) => (current.trim() ? current : nextDraft));
      setErrorMessage(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setPendingTextSendCount((current) => Math.max(0, current - 1));
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
    setErrorMessage("");
    setStatusMessage("");

    if (!clientName.trim()) {
      setOnboardingStep("name");
      setErrorMessage("Entre ton nom avant d'envoyer un media.");
      return;
    }

    setIsUploadingAttachment(true);

    try {
      const activeSession =
        session ||
        (await initializeClientConversationAccess(runtime.ownerId, clientName));
      const uploaded = await uploadChatAttachment(file, {
        kind: forcedKind,
        durationMs:
          forcedKind === "voice" && recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : null,
        ownerId: runtime.ownerId,
        conversationId: activeSession.conversationId,
        actor: "client",
        clientKey: activeSession.clientKey,
      });

      await sendClientMessage(
        runtime.ownerId,
        clientName,
        toChatMessageDraftFromUpload(uploaded),
      );
      setStatusMessage("Media envoye.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Envoi impossible.");
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

    if (!clientName.trim()) {
      setOnboardingStep("name");
      setErrorMessage("Entre ton nom avant d'envoyer un vocal.");
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

  async function handleStartConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    const trimmedName = nameDraft.trim();

    if (!trimmedName) {
      setErrorMessage("Ton nom est obligatoire pour commencer.");
      return;
    }

    setIsPreparingSession(true);

    try {
      const nextSession = await initializeClientConversationAccess(
        runtime.ownerId,
        trimmedName,
      );

      setClientName(nextSession.clientName);
      setNameDraft(nextSession.clientName);
      setPendingDiscussionId(nextSession.clientKey);
      setOnboardingStep("welcome");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Preparation impossible.",
      );
    } finally {
      setIsPreparingSession(false);
    }
  }

  async function handleRecoverConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    if (!recoverDiscussionId.trim()) {
      setErrorMessage("Entre ton ID de discussion.");
      return;
    }

    setIsRecovering(true);

    try {
      const restoredSession = await recoverClientConversation(
        runtime.ownerId,
        recoverDiscussionId,
        recoverSecurityCode,
      );

      setClientName(restoredSession.clientName);
      setNameDraft(restoredSession.clientName);
      setPendingDiscussionId(restoredSession.clientKey);
      setRecoverSecurityCode("");
      setOnboardingStep("none");
      setStatusMessage("Discussion recuperee avec succes.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Recuperation impossible.",
      );
    } finally {
      setIsRecovering(false);
    }
  }

  async function handleSaveSecurityCode(skip: boolean) {
    setErrorMessage("");
    setStatusMessage("");

    if (skip) {
      setOnboardingStep("none");
      setSecurityCodeDraft("");
      setPendingDiscussionId("");
      setStatusMessage("Discussion ouverte sans code de securite.");
      return;
    }

    if (!skip && !securityCodeDraft.trim()) {
      setErrorMessage(
        "Entre un code ou choisis de continuer sans code de securite.",
      );
      return;
    }

    setIsSavingSecurity(true);

    try {
      await setClientConversationSecurityCode(
        runtime.ownerId,
        securityCodeDraft,
      );
      setOnboardingStep("none");
      setSecurityCodeDraft("");
      setPendingDiscussionId("");
      setStatusMessage("Code de securite enregistre.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Configuration impossible.",
      );
    } finally {
      setIsSavingSecurity(false);
    }
  }

  async function handleCopyDiscussionId() {
    if (!session?.clientKey) {
      setStatusMessage("Ton ID sera disponible des que la discussion sera creee.");
      return;
    }

    try {
      await copyText(session.clientKey);
      setStatusMessage("ID de discussion copie.");
      setErrorMessage("");
    } catch {
      setErrorMessage("Copie impossible sur cet appareil.");
    }
  }

  function handleOpenAccessModal() {
    setErrorMessage("");
    setStatusMessage("");
    setRecoverSecurityCode("");
    setSecurityCodeDraft("");

    if (session?.clientKey) {
      setRecoverDiscussionId(session.clientKey);
      setOnboardingStep("recover");
      return;
    }

    setRecoverDiscussionId("");
    setOnboardingStep("name");
  }

  function handleStartFreshConversation() {
    clearClientChatSession(runtime.ownerId);
    setConversation(null);
    setSession(null);
    setClientName("");
    setNameDraft("");
    setDraft("");
    setRecoverDiscussionId("");
    setRecoverSecurityCode("");
    setSecurityCodeDraft("");
    setPendingDiscussionId("");
    setErrorMessage("");
    setStatusMessage("");
    setOnboardingStep("name");
  }

  function renderAvatar(sizeClassName: string) {
    if (ownerProfile.avatarUrl) {
      return (
        <img
          src={ownerProfile.avatarUrl}
          alt={ownerProfile.displayName}
          className={`${sizeClassName} rounded-full object-cover`}
        />
      );
    }

    return (
      <span
        className={`inline-flex ${sizeClassName} items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-700 text-sm font-semibold text-white`}
      >
        {getInitials(ownerProfile.displayName)}
      </span>
    );
  }

  return (
    <main className="page-shell relative min-h-dvh overflow-hidden text-white">
      <header className="fixed inset-x-0 top-0 z-20 mx-auto w-full max-w-5xl px-3 pt-3 md:px-4 md:pt-4">
        <div className="flex items-center gap-3 rounded-[1.4rem] border border-white/8 bg-[#111b21]/94 px-3 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-sm md:px-4">
          <button
            type="button"
            onClick={() => setShowAvatarPreview(true)}
            className="shrink-0"
            aria-label="Voir le profil en plein ecran"
          >
            {renderAvatar("size-12")}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100 md:text-base">
              {ownerProfile.displayName}
            </p>
            <p className="truncate text-xs text-slate-400 md:text-sm">
              {ownerProfile.jobTitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAccessModal}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-white/[0.08]"
            >
              <KeyRound className="size-3.5" />
              Acces
            </button>
            <Link
              href="/status"
              className={`inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-white/[0.08] ${
                hasUnreadStatuses
                  ? "status-button-glow"
                  : "bg-white/[0.04]"
              }`}
            >
              Statuts
            </Link>
            <button
              type="button"
              onClick={() => void handleCopyDiscussionId()}
              className="max-w-36 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right transition-colors hover:bg-white/[0.08]"
              aria-label="Copier l ID de discussion"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                ID
              </p>
              <p className="truncate text-xs font-semibold text-emerald-100">
                {visibleDiscussionId}
              </p>
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-3 pb-3 pt-24 md:px-4 md:pb-4 md:pt-28">
        <section className="relative flex flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-white/8 bg-black/10 backdrop-blur-[1px] md:rounded-[2rem]">
          {isConversationSyncing && conversation ? (
            <div className="border-b border-white/8 px-3 py-2 md:px-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-300">
                <LoaderCircle className="size-3.5 animate-spin" />
                Synchronisation de la discussion...
              </div>
            </div>
          ) : null}
          <div
            ref={messagesViewportRef}
            className="hide-scrollbar flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6"
          >
            {showConversationLoader ? (
              <div className="mx-auto flex h-full min-h-64 w-full max-w-2xl flex-col justify-center gap-3">
                <div className="loading-bar w-36" />
                <div className="ml-auto loading-bar w-2/3" />
                <div className="loading-bar w-1/2" />
                <div className="ml-auto loading-bar w-3/4" />
              </div>
            ) : renderedMessages.length ? (
              <div className="space-y-4">
                {hiddenMessageCount > 0 ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleMessageCount((currentValue) =>
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
                  <div key={group.dayKey} className="space-y-3">
                    <div className="flex justify-center">
                      <span className="rounded-full border border-white/8 bg-[#182229]/85 px-3 py-1 text-[11px] font-semibold text-slate-300 shadow-[0_8px_18px_rgba(0,0,0,0.25)]">
                        {group.dayLabel}
                      </span>
                    </div>

                    {group.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`max-w-[86%] rounded-[0.9rem] px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)] md:px-4 md:py-3 ${
                          message.sender === "client"
                            ? "ml-auto rounded-br-sm bg-[#005c4b] text-white"
                            : "mr-auto rounded-bl-sm bg-[#202c33]/95 text-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300/80">
                          <UserRound className="size-3" />
                          {message.sender === "client"
                            ? "toi"
                            : ownerProfile.displayName}
                        </div>
                        {renderMessageBody(message)}
                        <div className="mt-1.5 flex items-center justify-end gap-2">
                          {message.deliveryStatus === "queued" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-100/85">
                              <LoaderCircle className="size-3 animate-spin" />
                              Envoi...
                            </span>
                          ) : null}
                          <span className="text-[10px] text-slate-300/75">
                            {formatMessageTime(message.timestamp)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
                <MessageSquareMore className="size-9 text-slate-600" />
                <p className="mt-4 text-sm font-medium text-slate-400">
                  Envoie un message pour commencer.
                </p>
              </div>
            )}
          </div>

          {showScrollToLatestButton ? (
            <button
              type="button"
              onClick={scrollToLatestMessage}
              className="absolute bottom-[5.8rem] right-4 z-20 inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-[#111b21]/92 text-slate-100 shadow-[0_18px_36px_rgba(0,0,0,0.34)] transition-colors hover:bg-[#182229] md:bottom-24"
              aria-label="Aller au dernier message"
            >
              <ArrowDown className="size-4.5" />
            </button>
          ) : null}

          <div className="px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 md:px-3 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {isTextSendPending || isUploadingAttachment ? (
              <p className="mb-2 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
                <LoaderCircle className="size-4 animate-spin" />
                {isUploadingAttachment
                  ? "Upload en cours..."
                  : pendingTextSendCount > 1
                    ? `${pendingTextSendCount} messages en cours d envoi...`
                    : "Message en cours d envoi..."}
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

            <form onSubmit={handleSendMessage}>
              <input
                ref={attachmentInputRef}
                type="file"
                onChange={handleAttachmentInputChange}
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar,.xls,.xlsx,.ppt,.pptx"
              />

              <div className="flex items-end gap-2 rounded-[1.8rem] border border-white/10 bg-[#202c33]/94 px-2 py-2 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
                <button
                  type="button"
                  onClick={handleSelectAttachment}
                  disabled={isUploadingAttachment || isRecordingVoice}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Joindre un fichier"
                >
                  {isUploadingAttachment ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Paperclip className="size-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleVoiceRecording()}
                  disabled={isUploadingAttachment}
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
                    <Square className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                </button>

                <label className="block flex-1">
                  <span className="sr-only">Message</span>
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
                  disabled={isUploadingAttachment || isRecordingVoice || !draft.trim()}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#005c4b] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Envoyer le message"
                >
                  {isTextSendPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="size-4" />
                  )}
                  {isTextSendPending ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      {!hasResolvedInitialState && isRestoringSavedSession ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/56 px-4 backdrop-blur-sm">
          <section className="flex w-full max-w-sm items-center gap-3 rounded-[1.6rem] border border-white/10 bg-[#111b21]/94 px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-200">
              <LoaderCircle className="size-5 animate-spin" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Reconnexion a votre discussion
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Vos messages sont en cours de chargement sur cet appareil.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {hasResolvedInitialState && onboardingStep !== "none" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-[1.6rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] md:p-6">
            {onboardingStep === "name" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                  Premiere visite
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                  Comment t&apos;appelles-tu ?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Ton nom permet a {ownerProfile.displayName} de te reconnaitre
                  et de repondre correctement a cette discussion.
                </p>

                <form className="mt-5 space-y-4" onSubmit={handleStartConversation}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Ton nom
                    </span>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      autoFocus
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                      placeholder="Ex: Marie"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isPreparingSession}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#005c4b] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPreparingSession ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <UserRound className="size-4" />
                    )}
                    Continuer
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setRecoverDiscussionId("");
                    setRecoverSecurityCode("");
                    setErrorMessage("");
                    setOnboardingStep("recover");
                  }}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
                >
                  <KeyRound className="size-4" />
                  J&apos;avais deja une discussion
                </button>
              </>
            ) : null}

            {onboardingStep === "recover" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                      Recuperation
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                      Reprends ta discussion
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOnboardingStep("name")}
                    className="inline-flex size-10 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label="Retour"
                  >
                    <ArrowLeft className="size-4.5" />
                  </button>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Entre ton ID de discussion. Si tu avais defini un code de
                  securite, ajoute-le aussi.
                </p>

                <form className="mt-5 space-y-4" onSubmit={handleRecoverConversation}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      ID de discussion
                    </span>
                    <input
                      type="text"
                      value={recoverDiscussionId}
                      onChange={(event) => setRecoverDiscussionId(event.target.value)}
                      autoFocus
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                      placeholder="Ex: vch_xxxxx"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Code de securite (optionnel)
                    </span>
                    <input
                      type="password"
                      value={recoverSecurityCode}
                      onChange={(event) => setRecoverSecurityCode(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                      placeholder="Laisse vide si aucun code"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isRecovering}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#005c4b] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRecovering ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    Recuperer la discussion
                  </button>
                </form>

                <button
                  type="button"
                  onClick={handleStartFreshConversation}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
                >
                  <UserRound className="size-4" />
                  Commencer une nouvelle discussion
                </button>
              </>
            ) : null}

            {onboardingStep === "welcome" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                  Bienvenue
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                  Ta discussion est prete
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Ce site est cree par Toussaint Leo Vitch pour repondre au mieux
                  aux interactions avec son entourage et ses clients.
                </p>
                <div className="mt-5 rounded-3xl border border-emerald-300/12 bg-emerald-500/8 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
                    Ton ID de discussion
                  </p>
                  <p className="mt-2 break-all text-base font-semibold text-emerald-100">
                    {visibleDiscussionId}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-emerald-100/75">
                    Garde cet ID. Tu pourras recuperer cette discussion, meme en
                    changeant de telephone, en entrant simplement cet ID.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOnboardingStep("security")}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#005c4b] px-4 py-3 text-sm font-semibold text-white"
                >
                  Continuer
                </button>
              </>
            ) : null}

            {onboardingStep === "security" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                  Securite
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                  Ajoute un code de protection
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Si tu laisses cette discussion sans code, toute personne qui
                  connait ton ID de discussion peut la recuperer. Tu peux
                  toutefois choisir de la laisser sans code si tu le souhaites.
                </p>

                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Code de securite (optionnel)
                  </span>
                  <input
                    type="password"
                    value={securityCodeDraft}
                    onChange={(event) => setSecurityCodeDraft(event.target.value)}
                    autoFocus
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                    placeholder="Ex: 4 a 32 caracteres"
                  />
                </label>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveSecurityCode(false)}
                    disabled={isSavingSecurity}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#005c4b] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSavingSecurity ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Shield className="size-4" />
                    )}
                    Enregistrer le code
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveSecurityCode(true)}
                    disabled={isSavingSecurity}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Continuer sans code
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {showAvatarPreview ? (
        <div className="absolute inset-0 z-40 bg-black/95">
          <div className="flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => setShowAvatarPreview(false)}
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Retour"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowAvatarPreview(false)}
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Fermer"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex h-[calc(100dvh-5rem)] items-center justify-center px-6 pb-6">
            {ownerProfile.avatarUrl ? (
              <div className="relative h-full w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10">
                <img
                  src={ownerProfile.avatarUrl}
                  alt={ownerProfile.displayName}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-72 w-72 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-700 text-6xl font-semibold text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                {getInitials(ownerProfile.displayName)}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
