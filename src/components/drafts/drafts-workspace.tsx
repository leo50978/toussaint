"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Pin, Plus, Save, Search, Trash2 } from "lucide-react";

import type { PrivateDraftRecord } from "@/lib/drafts";

type DraftListResponse = {
  ownerId: string;
  syncedAt: string;
  drafts: PrivateDraftRecord[];
};

type DraftMutationResponse = {
  syncedAt: string;
  draft: PrivateDraftRecord;
};

type EditableDraft = {
  id: string;
  title: string;
  content: string;
  tags: string;
  isPinned: boolean;
};

const DRAFTS_SYNC_INTERVAL_MS = 12_000;

function formatSyncTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function toEditableDraft(draft: PrivateDraftRecord): EditableDraft {
  return {
    id: draft.id,
    title: draft.title,
    content: draft.content,
    tags: draft.tags.join(", "),
    isPinned: draft.isPinned,
  };
}

function toDraftPayload(draft: EditableDraft) {
  return {
    title: draft.title,
    content: draft.content,
    isPinned: draft.isPinned,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function isSameEditableDraft(
  left: EditableDraft | null,
  right: EditableDraft,
) {
  if (!left) {
    return false;
  }

  return (
    left.id === right.id &&
    left.title === right.title &&
    left.content === right.content &&
    left.tags === right.tags &&
    left.isPinned === right.isPinned
  );
}

function applyUpsert(
  drafts: PrivateDraftRecord[],
  nextDraft: PrivateDraftRecord,
) {
  const nextDrafts = drafts.some((draft) => draft.id === nextDraft.id)
    ? drafts.map((draft) => (draft.id === nextDraft.id ? nextDraft : draft))
    : [nextDraft, ...drafts];

  return [...nextDrafts].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export default function DraftsWorkspace() {
  const [drafts, setDrafts] = useState<PrivateDraftRecord[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [editorDraft, setEditorDraft] = useState<EditableDraft | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncLabel, setSyncLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());

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

      setDrafts(payload.drafts);
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
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
    loadDrafts();

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

    const handleVisibility = () => {
      if (!document.hidden) {
        void loadDrafts({
          silent: true,
        });
      }
      refreshPollingWindow();
    };

    const handleFocus = () => {
      void loadDrafts({
        silent: true,
      });
      refreshPollingWindow();
    };

    refreshPollingWindow();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!drafts.length) {
      setSelectedDraftId("");
      setEditorDraft(null);
      setIsDirty(false);
      setSaveState("idle");
      return;
    }

    if (!selectedDraftId || !drafts.some((draft) => draft.id === selectedDraftId)) {
      setSelectedDraftId(drafts[0].id);
      return;
    }

    const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId);

    if (!selectedDraft) {
      return;
    }

    const nextEditableDraft = toEditableDraft(selectedDraft);

    if (
      !editorDraft ||
      editorDraft.id !== selectedDraft.id ||
      (!isDirty && !isSameEditableDraft(editorDraft, nextEditableDraft))
    ) {
      setEditorDraft(nextEditableDraft);
      setIsDirty(false);
      setSaveState((currentValue) =>
        currentValue === "error" ? currentValue : "idle",
      );
    }
  }, [drafts, selectedDraftId, editorDraft, isDirty]);

  useEffect(() => {
    if (!editorDraft || !isDirty) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setSaveState("saving");

      try {
        const response = await fetch(`/api/owner/drafts/${editorDraft.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(toDraftPayload(editorDraft)),
        });

        if (!response.ok) {
          throw new Error("Autosave impossible.");
        }

        const payload = (await response.json()) as DraftMutationResponse;

        setDrafts((currentDrafts) => applyUpsert(currentDrafts, payload.draft));
        setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
        setIsDirty(false);
        setSaveState("saved");
        setErrorMessage("");
      } catch (error) {
        setSaveState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Autosave impossible.",
        );
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editorDraft, isDirty]);

  async function handleCreateDraft() {
    setIsCreating(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/owner/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Nouveau brouillon",
          content: "",
          tags: [],
          isPinned: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Creation impossible.");
      }

      const payload = (await response.json()) as DraftMutationResponse;

      setDrafts((currentDrafts) => applyUpsert(currentDrafts, payload.draft));
      setSelectedDraftId(payload.draft.id);
      setEditorDraft(toEditableDraft(payload.draft));
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
      setIsDirty(false);
      setSaveState("idle");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Creation impossible.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteDraft() {
    if (!editorDraft) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/owner/drafts/${editorDraft.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Suppression impossible.");
      }

      setDrafts((currentDrafts) =>
        currentDrafts.filter((draft) => draft.id !== editorDraft.id),
      );
      setSelectedDraftId("");
      setEditorDraft(null);
      setIsDirty(false);
      setSaveState("idle");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredDrafts = drafts.filter((draft) => {
    if (!deferredSearch) {
      return true;
    }

    const haystack = [
      draft.title,
      draft.content,
      draft.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredSearch);
  });

  return (
    <main className="page-shell mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-5 py-8 md:px-10 md:py-12">
      <header className="soft-card flex flex-col gap-4 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_24px_80px_rgba(30,27,22,0.08)] backdrop-blur md:flex-row md:items-end md:justify-between md:p-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">
            Brouillons prives
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-950 md:text-5xl">
            Espace de notes, templates et idees.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700 md:text-lg">
            Le module est independant de la messagerie, avec autosave, recherche,
            epinglage et synchronisation periodique entre sessions.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/owner"
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800"
          >
            <ArrowLeft className="size-4 text-[var(--accent)]" />
            Retour dashboard
          </Link>
          <button
            type="button"
            onClick={handleCreateDraft}
            disabled={isCreating}
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
          >
            <Plus className="size-4" />
            {isCreating ? "Creation..." : "Nouveau brouillon"}
          </button>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <aside className="soft-card rounded-[2rem] border border-[var(--border)] bg-[var(--surface-solid)] p-5 shadow-[0_20px_60px_rgba(30,27,22,0.05)] md:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                Liste privee
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {drafts.length} brouillon{drafts.length > 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {syncLabel || "Sync..."}
            </p>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Recherche
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border)] bg-white px-11 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-[var(--primary)]"
                placeholder="Titre, contenu, tags..."
              />
            </div>
          </label>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-stone-50 px-4 py-4 text-sm text-slate-600">
                <LoaderCircle className="size-4 animate-spin text-[var(--accent)]" />
                Chargement des brouillons...
              </div>
            ) : filteredDrafts.length ? (
              filteredDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => {
                    setSelectedDraftId(draft.id);
                    setIsDirty(false);
                    setSaveState("idle");
                  }}
                  className={`block w-full rounded-3xl border p-4 text-left transition-colors ${
                    selectedDraftId === draft.id
                      ? "border-[var(--primary)] bg-emerald-50"
                      : "border-[var(--border)] bg-white hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-950">
                      {draft.title}
                    </p>
                    {draft.isPinned ? (
                      <Pin className="size-4 fill-[var(--accent)] text-[var(--accent)]" />
                    ) : null}
                  </div>
                <p className="mt-2 text-sm text-slate-600">
                  {draft.content || "Brouillon vide"}
                </p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {formatSyncTime(draft.updatedAt)}
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-[var(--border)] bg-stone-50 px-6 py-12 text-center">
                <p className="text-base font-semibold text-slate-900">
                  Aucun brouillon visible
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Cree un brouillon ou ajuste la recherche.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="soft-card rounded-[2rem] border border-[var(--border)] bg-[var(--surface-solid)] p-5 shadow-[0_20px_60px_rgba(30,27,22,0.05)] md:p-6">
          {editorDraft ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Editeur
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {editorDraft.title || "Nouveau brouillon"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditorDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              isPinned: !currentDraft.isPinned,
                            }
                          : currentDraft,
                      );
                      setIsDirty(true);
                    }}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ${
                      editorDraft.isPinned
                        ? "bg-amber-100 text-amber-900"
                        : "border border-[var(--border)] bg-white text-slate-800"
                    }`}
                  >
                    <Pin className="size-4" />
                    {editorDraft.isPinned ? "Epinglé" : "Epingler"}
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteDraft}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-70"
                  >
                    <Trash2 className="size-4" />
                    {isDeleting ? "Suppression..." : "Supprimer"}
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Titre
                  </span>
                  <input
                    type="text"
                    value={editorDraft.title}
                    onChange={(event) => {
                      setEditorDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              title: event.target.value,
                            }
                          : currentDraft,
                      );
                      setIsDirty(true);
                    }}
                    className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-[var(--primary)]"
                    placeholder="Titre du brouillon"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Tags
                  </span>
                  <input
                    type="text"
                    value={editorDraft.tags}
                    onChange={(event) => {
                      setEditorDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              tags: event.target.value,
                            }
                          : currentDraft,
                      );
                      setIsDirty(true);
                    }}
                    className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-[var(--primary)]"
                    placeholder="vente, client, relance"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Contenu
                  </span>
                  <textarea
                    value={editorDraft.content}
                    onChange={(event) => {
                      setEditorDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              content: event.target.value,
                            }
                          : currentDraft,
                      );
                      setIsDirty(true);
                    }}
                    className="min-h-[24rem] w-full resize-y rounded-3xl border border-[var(--border)] bg-white px-4 py-4 text-sm leading-relaxed text-slate-900 outline-none transition-colors focus:border-[var(--primary)]"
                    placeholder="Ecris ton contenu prive ici..."
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-stone-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
                  <Save className="size-4 text-[var(--accent)]" />
                  {saveState === "saving" && "Autosave..."}
                  {saveState === "saved" && "Enregistre"}
                  {saveState === "error" && "Erreur de sauvegarde"}
                  {saveState === "idle" && (isDirty ? "Modifications en attente" : "Pret")}
                </div>

                <p className="text-sm text-slate-600">
                  Sync multi-session toutes les 4 secondes
                </p>
              </div>
            </>
          ) : (
            <div className="flex min-h-[36rem] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border)] bg-stone-50 px-6 text-center">
              <p className="text-base font-semibold text-slate-900">
                Aucun brouillon selectionne
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
                Cree un brouillon pour commencer, puis l autosave s activera
                automatiquement.
              </p>
            </div>
          )}

          {errorMessage ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
