"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  Eye,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
  Video,
} from "lucide-react";

import type { PrivateStatusRecord } from "@/lib/statuses";
import {
  createBrowserCacheKey,
  readBrowserCache,
  removeOutdatedBrowserCacheVersions,
  runWhenBrowserIdle,
  writeBrowserCache,
} from "@/lib/utils/browser-cache";

type StatusListResponse = {
  ownerId: string;
  syncedAt: string;
  statuses: PrivateStatusRecord[];
};

type StatusMutationResponse = {
  syncedAt: string;
  status: PrivateStatusRecord;
};

type StatusFormType = "text" | "image" | "video";

const STATUS_MANAGER_SYNC_INTERVAL_MS = 15_000;
const OWNER_STATUSES_CACHE_NAMESPACE = "vichly_owner_statuses_cache";
const OWNER_STATUSES_CACHE_KEY = createBrowserCacheKey(OWNER_STATUSES_CACHE_NAMESPACE);
const OWNER_STATUSES_CACHE_TTL_MS = 45 * 1000;
const OWNER_STATUSES_CACHE_MAX_BYTES = 120_000;
const OWNER_STATUSES_CACHE_MAX_ITEMS = 24;

function formatSyncTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatRemainingTime(expiresAt: string) {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();

  if (remainingMs <= 0) {
    return "Expire";
  }

  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor(
    (remainingMs % (60 * 60 * 1000)) / (60 * 1000),
  );

  return `${remainingHours}h ${remainingMinutes}m`;
}

function isMediaStatus(status: PrivateStatusRecord) {
  return status.type === "image" || status.type === "video";
}

function getStatusTypeLabel(type: StatusFormType | PrivateStatusRecord["type"]) {
  if (type === "image") {
    return "Image";
  }

  if (type === "video") {
    return "Video";
  }

  return "Texte";
}

function sortStatuses(statuses: PrivateStatusRecord[]) {
  return [...statuses].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function buildStatusesCachePayload(payload: StatusListResponse): StatusListResponse {
  return {
    ...payload,
    statuses: sortStatuses(payload.statuses).slice(0, OWNER_STATUSES_CACHE_MAX_ITEMS),
  };
}

export default function StatusesManager() {
  const [statuses, setStatuses] = useState<PrivateStatusRecord[]>([]);
  const [statusType, setStatusType] = useState<StatusFormType>("text");
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [syncLabel, setSyncLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingStatusId, setDeletingStatusId] = useState("");

  async function loadStatuses(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/owner/statuses", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Chargement des status impossible.");
      }

      const payload = (await response.json()) as StatusListResponse;

      setStatuses(sortStatuses(payload.statuses));
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
      writeBrowserCache(OWNER_STATUSES_CACHE_KEY, buildStatusesCachePayload(payload), OWNER_STATUSES_CACHE_TTL_MS, {
        maxBytes: OWNER_STATUSES_CACHE_MAX_BYTES,
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
    removeOutdatedBrowserCacheVersions(OWNER_STATUSES_CACHE_NAMESPACE);
    const cachedStatuses = readBrowserCache<StatusListResponse>(OWNER_STATUSES_CACHE_KEY);

    if (cachedStatuses) {
      setStatuses(sortStatuses(cachedStatuses.statuses));
      setSyncLabel(`Sync ${formatSyncTime(cachedStatuses.syncedAt)}`);
      setIsLoading(false);
    }

    const cancelIdleLoad = runWhenBrowserIdle(() => {
      void loadStatuses();
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
        void loadStatuses({
          silent: true,
        });
      }, STATUS_MANAGER_SYNC_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        void loadStatuses({
          silent: true,
        });
      }
      refreshPollingWindow();
    };

    const handleFocus = () => {
      void loadStatuses({
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
      cancelIdleLoad();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.set("type", statusType);
      formData.set("content", content);

      if (selectedFile) {
        formData.set("file", selectedFile);
      }

      const response = await fetch("/api/owner/statuses", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Creation du statut impossible.");
      }

      const payload = (await response.json()) as StatusMutationResponse;

      setStatuses((currentStatuses) =>
        sortStatuses([payload.status, ...currentStatuses]),
      );
      setSyncLabel(`Sync ${formatSyncTime(payload.syncedAt)}`);
      setContent("");
      setSelectedFile(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Creation impossible.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(statusId: string) {
    setDeletingStatusId(statusId);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/owner/statuses/${statusId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Suppression du statut impossible.");
      }

      setStatuses((currentStatuses) =>
        currentStatuses.filter((status) => status.id !== statusId),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
    } finally {
      setDeletingStatusId("");
    }
  }

  return (
    <main className="page-shell relative min-h-dvh overflow-hidden text-white">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[18px_18px_44px_rgba(0,0,0,0.34),-10px_-10px_28px_rgba(255,255,255,0.02)] backdrop-blur-2xl md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-emerald-200/90">
                Espace prive owner
              </p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-5xl">
                Pilote tes status avec une interface claire.
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-slate-300 md:text-base">
                Publie un status texte, image ou video en quelques secondes.
                Tout ce que tu mets ici devient visible sur la page status
                client, puis expire automatiquement apres 24h.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/status"
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/14 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_25px_rgba(16,185,129,0.12)] transition-colors hover:bg-emerald-400/18"
              >
                Voir le rendu client
              </Link>
              <Link
                href="/owner"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:bg-white/[0.08]"
              >
                <ArrowLeft className="size-4" />
                Retour dashboard
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-black/18 px-4 py-3 shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sync
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-100">
                {syncLabel || "Sync..."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/18 px-4 py-3 shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Actifs
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-100">
                {statuses.length} status en ligne
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/18 px-4 py-3 shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Format actif
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-100">
                {getStatusTypeLabel(statusType)}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[20px_20px_48px_rgba(0,0,0,0.34),-10px_-10px_26px_rgba(255,255,255,0.02)] backdrop-blur-2xl md:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Creation
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  Nouveau status
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Publication rapide
              </div>
            </div>

            <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
              <div>
                <span className="mb-3 block text-sm font-semibold text-slate-200">
                  Type de status
                </span>
                <div className="grid grid-cols-3 gap-2 rounded-3xl border border-white/8 bg-black/18 p-2 shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
                  {(["text", "image", "video"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setStatusType(type);
                        setSelectedFile(null);
                      }}
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold transition-colors ${
                        statusType === type
                          ? "bg-emerald-400/14 text-emerald-100 shadow-[0_10px_24px_rgba(16,185,129,0.12)]"
                          : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                      }`}
                    >
                      {getStatusTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-200">
                  {statusType === "text" ? "Message visible" : "Legende"}
                </span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-44 w-full resize-y rounded-[1.6rem] border border-white/10 bg-[#0b1620]/95 px-4 py-4 text-sm leading-relaxed text-white caret-emerald-200 outline-none shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)] placeholder:text-slate-500 focus:border-emerald-300/20"
                  style={{
                    color: "#ffffff",
                    WebkitTextFillColor: "#ffffff",
                  }}
                  placeholder={
                    statusType === "text"
                      ? "Ecris un message court, clair et impactant..."
                      : "Ajoute une legende optionnelle..."
                  }
                />
              </label>

              {statusType !== "text" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-200">
                    Fichier media
                  </span>
                  <div className="rounded-[1.6rem] border border-dashed border-white/12 bg-black/16 p-4 shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
                    <input
                      key={statusType}
                      type="file"
                      accept={statusType === "image" ? "image/*" : "video/*"}
                      onChange={(event) =>
                        setSelectedFile(event.target.files?.[0] || null)
                      }
                      className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                    />
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      {statusType === "image"
                        ? "Images jusqu a 8 Mo. Les images sont nettoyees automatiquement apres expiration."
                        : "Videos jusqu a 32 Mo. Les medias ne restent pas publics apres expiration."}
                    </p>
                  </div>
                </label>
              ) : null}

              {selectedFile ? (
                <div className="rounded-2xl border border-emerald-300/12 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">
                  Fichier selectionne: {selectedFile.name}
                </div>
              ) : null}

              {errorMessage ? (
                <p className="rounded-2xl border border-rose-300/15 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/14 px-5 py-3.5 text-sm font-semibold text-emerald-100 shadow-[0_14px_34px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {isSubmitting ? "Publication..." : "Publier le status"}
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[20px_20px_48px_rgba(0,0,0,0.34),-10px_-10px_26px_rgba(255,255,255,0.02)] backdrop-blur-2xl md:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Status actifs
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {statuses.length} en cours
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Expiration 24h
              </div>
            </div>

            <div className="hide-scrollbar mt-5 max-h-[68dvh] space-y-4 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/18 px-4 py-4 text-sm text-slate-300 shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
                  <LoaderCircle className="size-4 animate-spin text-emerald-200" />
                  Chargement des status...
                </div>
              ) : statuses.length ? (
                statuses.map((status) => (
                  <article
                    key={status.id}
                    className="rounded-[1.7rem] border border-white/10 bg-black/20 p-4 shadow-[12px_12px_28px_rgba(0,0,0,0.22),-6px_-6px_18px_rgba(255,255,255,0.02)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {getStatusTypeLabel(status.type)}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-100">
                          {status.content || "Statut media sans texte"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(status.id)}
                        disabled={deletingStatusId === status.id}
                        className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-rose-300/12 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-500/14 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Trash2 className="size-4" />
                        {deletingStatusId === status.id ? "..." : "Suppr."}
                      </button>
                    </div>

                    {status.type === "image" ? (
                      <Image
                        src={status.storageUrl}
                        alt={status.content || "Statut image"}
                        width={1200}
                        height={1200}
                        unoptimized
                        className="mt-4 h-52 w-full rounded-[1.4rem] object-cover"
                      />
                    ) : null}

                    {status.type === "video" ? (
                      <video
                        src={status.storageUrl}
                        className="mt-4 h-52 w-full rounded-[1.4rem] object-cover"
                        muted
                        controls
                        preload="metadata"
                      />
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
                        <Clock3 className="size-4 text-emerald-200" />
                        {formatRemainingTime(status.expiresAt)}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
                        <Eye className="size-4 text-emerald-200" />
                        {status.viewCount} vues
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
                        {status.type === "image" ? (
                          <ImagePlus className="size-4 text-emerald-200" />
                        ) : status.type === "video" ? (
                          <Video className="size-4 text-emerald-200" />
                        ) : (
                          <Clock3 className="size-4 text-emerald-200" />
                        )}
                        {isMediaStatus(status)
                          ? `${Math.max(1, Math.round(status.fileSize / 1024))} Ko`
                          : "Texte"}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-white/12 bg-black/18 px-6 py-12 text-center shadow-[inset_6px_6px_14px_rgba(0,0,0,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.02)]">
                  <p className="text-base font-semibold text-white">
                    Aucun status actif
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    Publie un status texte, image ou video pour alimenter la
                    page client.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
