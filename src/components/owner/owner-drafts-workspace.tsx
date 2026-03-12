"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  LoaderCircle,
  MoreVertical,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { DraftEntryRecord, PrivateDraftRecord } from "@/lib/drafts";
import {
  createBrowserCacheKey,
  readBrowserCache,
  removeOutdatedBrowserCacheVersions,
  runWhenBrowserIdle,
  writeBrowserCache,
} from "@/lib/utils/browser-cache";
import { copyText } from "@/lib/utils/copy-text";
import { createId } from "@/lib/utils/create-id";

type OwnerDraftsWorkspaceProps = {
  onSelectFilter: (filter: "all" | "unread" | "drafts") => void;
  onOpenStatuses: () => void;
};

type DraftListResponse = {
  ownerId: string;
  syncedAt: string;
  drafts: PrivateDraftRecord[];
};

type DraftMutationResponse = {
  syncedAt: string;
  draft: PrivateDraftRecord;
};

type DraftAssistantResponse = DraftMutationResponse & {
  source: "openai" | "fallback";
  model: string;
};

const DRAFTS_SYNC_INTERVAL_MS = 12_000;
const OWNER_DRAFTS_CACHE_NAMESPACE = "vichly_owner_drafts_cache";
const OWNER_DRAFTS_CACHE_KEY = createBrowserCacheKey(OWNER_DRAFTS_CACHE_NAMESPACE);
const OWNER_DRAFTS_CACHE_TTL_MS = 5 * 60 * 1000;
const OWNER_DRAFTS_CACHE_MAX_BYTES = 220_000;
const OWNER_DRAFTS_CACHE_MAX_DRAFTS = 24;
const OWNER_DRAFTS_CACHE_MAX_ENTRIES_PER_DRAFT = 40;

function formatListTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
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
    year:
      currentDate.getFullYear() === targetDate.getFullYear() ? undefined : "numeric",
  }).format(targetDate);
}

function buildEntryGroups(entries: DraftEntryRecord[]) {
  return entries.reduce<Array<{ label: string; entries: DraftEntryRecord[] }>>(
    (groups, entry) => {
      const label = formatDayLabel(entry.createdAt);
      const currentGroup = groups.at(-1);

      if (!currentGroup || currentGroup.label !== label) {
        groups.push({
          label,
          entries: [entry],
        });
        return groups;
      }

      currentGroup.entries.push(entry);
      return groups;
    },
    [],
  );
}

function getInitials(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "BR";
  }

  return normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getDraftPreview(draft: PrivateDraftRecord) {
  const lastEntry = draft.entries.at(-1);

  if (lastEntry?.content.trim()) {
    return lastEntry.content.trim();
  }

  return "Brouillon vide";
}

function formatSyncTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function sortDrafts(drafts: PrivateDraftRecord[]) {
  return [...drafts].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function applyUpsert(drafts: PrivateDraftRecord[], nextDraft: PrivateDraftRecord) {
  const nextDrafts = drafts.some((draft) => draft.id === nextDraft.id)
    ? drafts.map((draft) => (draft.id === nextDraft.id ? nextDraft : draft))
    : [nextDraft, ...drafts];

  return sortDrafts(nextDrafts);
}

function writeDraftsCache(payload: DraftListResponse) {
  writeBrowserCache(OWNER_DRAFTS_CACHE_KEY, payload, OWNER_DRAFTS_CACHE_TTL_MS, {
    maxBytes: OWNER_DRAFTS_CACHE_MAX_BYTES,
  });
}

function buildDraftsCachePayload(
  drafts: PrivateDraftRecord[],
  syncedAt: string,
): DraftListResponse {
  const persistedDrafts = sortDrafts(drafts)
    .slice(0, OWNER_DRAFTS_CACHE_MAX_DRAFTS)
    .map((draft) => ({
      ...draft,
      content: draft.content.slice(0, 8_000),
      tags: draft.tags.slice(0, 20),
      entries: draft.entries.slice(-OWNER_DRAFTS_CACHE_MAX_ENTRIES_PER_DRAFT),
    }));

  return {
    ownerId: persistedDrafts[0]?.ownerId || "vichly-owner",
    syncedAt,
    drafts: persistedDrafts,
  };
}

function buildOwnerEntry(content: string): DraftEntryRecord {
  const now = new Date().toISOString();

  return {
    id: createId(),
    role: "owner",
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export default function OwnerDraftsWorkspace({
  onSelectFilter,
  onOpenStatuses,
}: OwnerDraftsWorkspaceProps) {
  const threadViewportRef = useRef<HTMLDivElement | null>(null);
  const [drafts, setDrafts] = useState<PrivateDraftRecord[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const [mobilePanel, setMobilePanel] = useState<"list" | "thread">("list");
  const [draftInput, setDraftInput] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingEntryId, setIsDeletingEntryId] = useState<string | null>(null);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDraftTitle, setNewDraftTitle] = useState("");
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [showDraftSettings, setShowDraftSettings] = useState(false);
  const [draftSettingsTitle, setDraftSettingsTitle] = useState("");
  const [draftSettingsPinned, setDraftSettingsPinned] = useState(false);
  const [draftSettingsAiEnabled, setDraftSettingsAiEnabled] = useState(false);
  const [isSavingDraftSettings, setIsSavingDraftSettings] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [assistantMeta, setAssistantMeta] = useState<{
    source: "openai" | "fallback";
    model: string;
  } | null>(null);

  const selectedDraft =
    drafts.find((draft) => draft.id === selectedDraftId) || null;

  const visibleDrafts = useMemo(() => {
    return drafts.filter((draft) => {
      if (!deferredSearch) {
        return true;
      }

      const haystack = [
        draft.title,
        draft.content,
        draft.tags.join(" "),
        draft.entries.map((entry) => entry.content).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [drafts, deferredSearch]);

  const entryGroups = useMemo(
    () => buildEntryGroups(selectedDraft?.entries || []),
    [selectedDraft?.entries],
  );

  async function loadDrafts(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/owner/drafts", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Chargement des brouillons impossible.");
      }

      const payload = (await response.json()) as DraftListResponse;
      const nextDrafts = sortDrafts(payload.drafts);

      setDrafts(nextDrafts);
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
      writeDraftsCache({
        ...payload,
        drafts: nextDrafts,
      });
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Chargement impossible.",
      );
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    removeOutdatedBrowserCacheVersions(OWNER_DRAFTS_CACHE_NAMESPACE);
    const cachedDrafts = readBrowserCache<DraftListResponse>(OWNER_DRAFTS_CACHE_KEY);

    if (cachedDrafts) {
      const nextDrafts = sortDrafts(cachedDrafts.drafts);
      setDrafts(nextDrafts);
      setSyncLabel(`Sync ${formatSyncTime(cachedDrafts.syncedAt)}`);
      setIsLoading(false);
    }

    const cancelIdleLoad = runWhenBrowserIdle(() => {
      void loadDrafts();
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
        void loadDrafts({
          silent: true,
        });
      }, DRAFTS_SYNC_INTERVAL_MS);
    };

    const handleFocus = () => {
      void loadDrafts({
        silent: true,
      });
      refreshPollingWindow();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadDrafts({
          silent: true,
        });
      }
      refreshPollingWindow();
    };

    refreshPollingWindow();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      cancelIdleLoad();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!drafts.length) {
      setSelectedDraftId("");
      setEditingEntryId(null);
      return;
    }

    if (!selectedDraftId || !drafts.some((draft) => draft.id === selectedDraftId)) {
      setSelectedDraftId(drafts[0].id);
    }
  }, [drafts, selectedDraftId]);

  useEffect(() => {
    if (!selectedDraft) {
      return;
    }

    if (!showDraftSettings) {
      return;
    }

    setDraftSettingsTitle(selectedDraft.title);
    setDraftSettingsPinned(selectedDraft.isPinned);
    setDraftSettingsAiEnabled(selectedDraft.aiAssistantEnabled);
  }, [selectedDraft, showDraftSettings]);

  useEffect(() => {
    setDraftInput("");
    setEditingEntryId(null);
    setCopiedEntryId(null);
    setAssistantMeta(null);
    setStatusMessage("");
    setErrorMessage("");
  }, [selectedDraftId]);

  async function handleCopyEntry(entry: DraftEntryRecord) {
    const content = entry.content.trim();

    if (!content) {
      return;
    }

    try {
      await copyText(content);
      setCopiedEntryId(entry.id);
      setStatusMessage("Message copie.");
      window.setTimeout(() => {
        setCopiedEntryId((currentValue) =>
          currentValue === entry.id ? null : currentValue,
        );
      }, 1400);
    } catch {
      setErrorMessage("Copie impossible.");
    }
  }

  useEffect(() => {
    if (!threadViewportRef.current) {
      return;
    }

    threadViewportRef.current.scrollTop = threadViewportRef.current.scrollHeight;
  }, [selectedDraft?.id, selectedDraft?.entries.length]);

  async function persistDraft(nextDraft: PrivateDraftRecord, successLabel?: string) {
    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch(`/api/owner/drafts/${nextDraft.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: nextDraft.title,
          content: nextDraft.content,
          tags: nextDraft.tags,
          isPinned: nextDraft.isPinned,
          entries: nextDraft.entries,
          aiAssistantEnabled: nextDraft.aiAssistantEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error("Enregistrement du brouillon impossible.");
      }

      const payload = (await response.json()) as DraftMutationResponse;
      setDrafts((currentDrafts) => {
        const nextDrafts = applyUpsert(currentDrafts, payload.draft);
        writeDraftsCache(buildDraftsCachePayload(nextDrafts, payload.syncedAt));
        return nextDrafts;
      });
      setSelectedDraftId(payload.draft.id);
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
      setStatusMessage(successLabel || "Brouillon enregistre.");
      return payload.draft;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Enregistrement impossible.",
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateDraft() {
    const normalizedTitle = newDraftTitle.trim();

    setIsCreatingDraft(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/owner/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: normalizedTitle || "Nouveau brouillon",
          content: "",
          tags: [],
          isPinned: false,
          entries: [],
          aiAssistantEnabled: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Creation du brouillon impossible.");
      }

      const payload = (await response.json()) as DraftMutationResponse;
      setDrafts((currentDrafts) => {
        const nextDrafts = applyUpsert(currentDrafts, payload.draft);
        writeDraftsCache(buildDraftsCachePayload(nextDrafts, payload.syncedAt));
        return nextDrafts;
      });
      setSelectedDraftId(payload.draft.id);
      setMobilePanel("thread");
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
      setShowCreateModal(false);
      setNewDraftTitle("");
      setStatusMessage("Brouillon cree.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Creation impossible.");
    } finally {
      setIsCreatingDraft(false);
    }
  }

  async function handleSaveDraftSettings() {
    if (!selectedDraft) {
      return;
    }

    setIsSavingDraftSettings(true);

    const savedDraft = await persistDraft(
      {
        ...selectedDraft,
        title: draftSettingsTitle.trim() || selectedDraft.title,
        isPinned: draftSettingsPinned,
        aiAssistantEnabled: draftSettingsAiEnabled,
      },
      "Parametres du brouillon enregistres.",
    );

    if (savedDraft) {
      setShowDraftSettings(false);
      setAssistantMeta(null);
    }

    setIsSavingDraftSettings(false);
  }

  async function handleDeleteDraft() {
    if (!selectedDraft) {
      return;
    }

    setIsDeletingDraft(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/owner/drafts/${selectedDraft.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Suppression impossible.");
      }

      setDrafts((currentDrafts) => {
        const nextDrafts = currentDrafts.filter(
          (draft) => draft.id !== selectedDraft.id,
        );
        writeDraftsCache(buildDraftsCachePayload(nextDrafts, new Date().toISOString()));
        return nextDrafts;
      });
      setSelectedDraftId("");
      setShowDraftSettings(false);
      setStatusMessage("Brouillon supprime.");
      setDraftInput("");
      setEditingEntryId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
    } finally {
      setIsDeletingDraft(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!selectedDraft) {
      return;
    }

    setIsDeletingEntryId(entryId);

    const savedDraft = await persistDraft(
      {
        ...selectedDraft,
        entries: selectedDraft.entries.filter((entry) => entry.id !== entryId),
      },
      "Element supprime du brouillon.",
    );

    if (savedDraft && editingEntryId === entryId) {
      setEditingEntryId(null);
      setDraftInput("");
    }

    setIsDeletingEntryId(null);
  }

  async function handleSendEntry() {
    if (!selectedDraft || !draftInput.trim()) {
      return;
    }

    const normalizedInput = draftInput.trim();

    if (editingEntryId) {
      const nextEntries = selectedDraft.entries.map((entry) =>
        entry.id === editingEntryId
          ? {
              ...entry,
              content: normalizedInput,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      );

      const savedDraft = await persistDraft(
        {
          ...selectedDraft,
          entries: nextEntries,
        },
        "Note mise a jour.",
      );

      if (savedDraft) {
        setEditingEntryId(null);
        setDraftInput("");
      }

      return;
    }

    if (selectedDraft.aiAssistantEnabled) {
      setIsSaving(true);
      setErrorMessage("");
      setStatusMessage("");

      try {
        const response = await fetch(
          `/api/owner/drafts/${selectedDraft.id}/assistant`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: normalizedInput,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Assistant IA indisponible.");
        }

        const payload = (await response.json()) as DraftAssistantResponse;
        setDrafts((currentDrafts) => {
          const nextDrafts = applyUpsert(currentDrafts, payload.draft);
          writeDraftsCache(buildDraftsCachePayload(nextDrafts, payload.syncedAt));
          return nextDrafts;
        });
        setSelectedDraftId(payload.draft.id);
        setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
        setDraftInput("");
        setAssistantMeta({
          source: payload.source,
          model: payload.model,
        });
        setStatusMessage("Assistant IA a repondu dans le brouillon.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Assistant IA indisponible.",
        );
      } finally {
        setIsSaving(false);
      }

      return;
    }

    const savedDraft = await persistDraft(
      {
        ...selectedDraft,
        entries: [...selectedDraft.entries, buildOwnerEntry(normalizedInput)],
      },
      "Contenu ajoute au brouillon.",
    );

    if (savedDraft) {
      setDraftInput("");
    }
  }

  return (
    <>
      <section className="flex h-[calc(100dvh-1rem)] overflow-hidden rounded-[1.4rem] border border-white/8 bg-black/10 shadow-[0_24px_70px_rgba(0,0,0,0.34)] md:rounded-[1.8rem]">
        <aside
          className={`${
            mobilePanel === "thread" ? "hidden lg:flex" : "flex"
          } w-full shrink-0 flex-col border-r border-white/8 bg-[#111b21]/94 backdrop-blur-sm lg:w-[390px]`}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4 md:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Brouillons
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {drafts.length} brouillon{drafts.length > 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewDraftTitle("");
                setShowCreateModal(true);
              }}
              className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Creer un brouillon"
            >
              <Plus className="size-4.5" />
            </button>
          </div>

          <div className="px-4 md:px-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Rechercher un brouillon"
                className="w-full rounded-full border border-white/6 bg-white/[0.06] py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
              />
            </label>
          </div>

          <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-3 md:px-5">
            <button
              type="button"
              onClick={() => onSelectFilter("all")}
              className="shrink-0 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
            >
              Toutes
            </button>
            <button
              type="button"
              onClick={() => onSelectFilter("unread")}
              className="shrink-0 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
            >
              Non lues
            </button>
            <button
              type="button"
              onClick={onOpenStatuses}
              className="shrink-0 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
            >
              Statues
            </button>
            <button
              type="button"
              className="shrink-0 rounded-full bg-emerald-500/18 px-3 py-1.5 text-xs font-semibold text-emerald-200"
            >
              Brouillons
            </button>
          </div>

          <div className="px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {syncLabel || "Sync..."}
          </div>

          <div className="hide-scrollbar flex-1 overflow-y-auto">
            <div className="space-y-0.5 px-2 pb-3">
              {isLoading ? (
                <div className="px-3 py-12 text-center">
                  <LoaderCircle className="mx-auto size-5 animate-spin text-slate-500" />
                  <p className="mt-3 text-sm font-medium text-slate-300">
                    Chargement des brouillons...
                  </p>
                </div>
              ) : visibleDrafts.length ? (
                visibleDrafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => {
                      setSelectedDraftId(draft.id);
                      setMobilePanel("thread");
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                      selectedDraftId === draft.id
                        ? "bg-white/[0.08]"
                        : "hover:bg-white/[0.045]"
                    }`}
                  >
                    <div className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-900 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
                      {getInitials(draft.title)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {draft.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {formatListTime(draft.updatedAt)}
                        </span>
                      </div>

                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                        {getDraftPreview(draft)}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {draft.aiAssistantEnabled ? "Assistant IA actif" : "Note privee"}
                        </span>
                        {draft.isPinned ? (
                          <Pin className="size-3.5 fill-amber-300 text-amber-300" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-12 text-center">
                  <p className="text-sm font-medium text-slate-300">
                    Aucun brouillon visible
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Cree un brouillon ou ajuste la recherche.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section
          className={`${
            mobilePanel === "thread" ? "flex" : "hidden"
          } min-w-0 flex-1 flex-col lg:flex`}
        >
          {selectedDraft ? (
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

                <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-900 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
                  {getInitials(selectedDraft.title)}
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-slate-100 md:text-base">
                    {selectedDraft.title}
                  </h2>
                  <p className="truncate text-xs text-slate-400">
                    {selectedDraft.aiAssistantEnabled
                      ? "Assistant IA actif pour ce brouillon"
                      : "Clipboard prive"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDraftSettings(true)}
                  className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Ouvrir les parametres du brouillon"
                >
                  <MoreVertical className="size-4.5" />
                </button>
              </header>

              <div
                ref={threadViewportRef}
                className="hide-scrollbar flex-1 overflow-y-auto px-3 py-4 md:px-5"
              >
                {entryGroups.length ? (
                  <div className="space-y-5">
                    {entryGroups.map((group) => (
                      <div key={group.label}>
                        <div className="mb-4 flex justify-center">
                          <span className="rounded-full bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-300 backdrop-blur-sm">
                            {group.label}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {group.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`flex ${
                                entry.role === "owner" ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-[min(82%,42rem)] rounded-2xl px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)] ${
                                  entry.role === "owner"
                                    ? "bg-[#005c4b] text-white"
                                    : "border border-white/8 bg-[#202c33]/94 text-slate-100"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                                      {entry.role === "assistant" ? "Assistant IA" : "Moi"}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                                      {entry.content}
                                    </p>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleCopyEntry(entry)}
                                      className="inline-flex size-7 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-black/10 hover:text-white"
                                      aria-label="Copier ce message"
                                    >
                                      {copiedEntryId === entry.id ? (
                                        <Check className="size-3.5" />
                                      ) : (
                                        <Copy className="size-3.5" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteEntry(entry.id)}
                                      disabled={isDeletingEntryId === entry.id}
                                      className="inline-flex size-7 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-black/10 hover:text-white disabled:opacity-50"
                                      aria-label="Supprimer cet element"
                                    >
                                      {isDeletingEntryId === entry.id ? (
                                        <LoaderCircle className="size-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-white/65">
                                    {formatBubbleTime(entry.updatedAt)}
                                  </span>
                                  {entry.role === "owner" ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEntryId(entry.id);
                                        setDraftInput(entry.content);
                                      }}
                                      className="text-[11px] font-semibold text-white/70 transition-colors hover:text-white"
                                    >
                                      Modifier
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <Sparkles className="size-10 text-slate-600" />
                    <p className="mt-4 text-sm font-medium text-slate-300">
                      Brouillon vide.
                    </p>
                    <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                      Ajoute des notes, colle du texte, ou active l assistant IA pour
                      travailler dans ce brouillon.
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-white/8 bg-[#111b21]/90 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm md:px-3 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {selectedDraft.aiAssistantEnabled ? (
                  <div className="mb-2 rounded-2xl border border-emerald-400/12 bg-emerald-500/8 px-4 py-3 text-xs text-emerald-100">
                    Mode assistant actif. Chaque nouveau message devient une tache pour
                    l assistant de ce brouillon.
                    {assistantMeta ? ` ${assistantMeta.source} • ${assistantMeta.model}` : ""}
                  </div>
                ) : null}

                {statusMessage ? (
                  <p className="mb-2 rounded-2xl bg-emerald-500/12 px-4 py-2 text-sm text-emerald-100">
                    {statusMessage}
                  </p>
                ) : null}

                {errorMessage ? (
                  <p className="mb-2 rounded-2xl bg-rose-500/12 px-4 py-2 text-sm text-rose-100">
                    {errorMessage}
                  </p>
                ) : null}

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSendEntry();
                  }}
                >
                  <div className="flex items-end gap-2 rounded-[1.8rem] border border-white/10 bg-[#202c33]/94 px-2 py-2 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
                    <button
                      type="button"
                      onClick={() => setShowDraftSettings(true)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                      aria-label="Parametres du brouillon"
                    >
                      {selectedDraft.aiAssistantEnabled ? (
                        <Sparkles className="size-4.5" />
                      ) : (
                        <MoreVertical className="size-4.5" />
                      )}
                    </button>

                    <label className="block flex-1">
                      <span className="sr-only">Message du brouillon</span>
                      <textarea
                        value={draftInput}
                        onChange={(event) => setDraftInput(event.target.value)}
                        className="max-h-36 min-h-10 w-full resize-none bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-slate-400"
                        placeholder={
                          editingEntryId
                            ? "Modifier cette note"
                            : selectedDraft.aiAssistantEnabled
                              ? "Donne une tache a l assistant"
                              : "Ajouter une note ou coller un texte"
                        }
                        rows={1}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isSaving || !draftInput.trim()}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#005c4b] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Envoyer"
                    >
                      {isSaving ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="size-4" />
                      )}
                      {editingEntryId
                        ? "Mettre a jour"
                        : selectedDraft.aiAssistantEnabled
                          ? "Lancer"
                          : "Ajouter"}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <Sparkles className="size-10 text-slate-600" />
              <p className="mt-4 text-sm font-medium text-slate-300">
                Selectionne un brouillon.
              </p>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                Tes notes privees et ton assistant de travail apparaitront ici.
              </p>
            </div>
          )}
        </section>
      </section>

      {showCreateModal ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.4rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Nouveau brouillon
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Donne un nom a ce brouillon.
            </p>

            <input
              type="text"
              value={newDraftTitle}
              onChange={(event) => setNewDraftTitle(event.target.value)}
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
              placeholder="Ex: Projet 1"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.08]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleCreateDraft()}
                disabled={isCreatingDraft}
                className="inline-flex items-center gap-2 rounded-full bg-[#005c4b] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:opacity-60"
              >
                {isCreatingDraft ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                Creer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDraftSettings && selectedDraft ? (
        <div className="absolute inset-0 z-30 flex items-start justify-end bg-black/55 px-3 py-3 backdrop-blur-sm">
          <div className="hide-scrollbar max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.3rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Parametres du brouillon
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {selectedDraft.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDraftSettings(false)}
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fermer"
              >
                <MoreVertical className="size-4.5 rotate-90" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Nom du brouillon
                </span>
                <input
                  type="text"
                  value={draftSettingsTitle}
                  onChange={(event) => setDraftSettingsTitle(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                  placeholder="Projet 1"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={draftSettingsPinned}
                  onChange={(event) => setDraftSettingsPinned(event.target.checked)}
                  className="size-4 rounded border-white/10 bg-transparent"
                />
                Epingler ce brouillon
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={draftSettingsAiEnabled}
                  onChange={(event) => setDraftSettingsAiEnabled(event.target.checked)}
                  className="size-4 rounded border-white/10 bg-transparent"
                />
                Activer l assistance IA dans ce brouillon
              </label>

              <p className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-400">
                Quand l assistance IA est active, chaque nouveau message de ce
                brouillon est traite comme une tache et l assistant repond
                directement dans la discussion.
              </p>

              <button
                type="button"
                onClick={() => void handleSaveDraftSettings()}
                disabled={isSavingDraftSettings}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#005c4b] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:opacity-60"
              >
                {isSavingDraftSettings ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                Enregistrer
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteDraft()}
                disabled={isDeletingDraft}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-5 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-500/15 disabled:opacity-60"
              >
                {isDeletingDraft ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Supprimer ce brouillon
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
