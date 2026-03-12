"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";

import type { PrivateStatusRecord } from "@/lib/statuses";
import {
  cacheStatusImage,
  migrateLegacyStatusImageCacheToIndexedDb,
  pruneStatusImageCache,
  readCachedStatusImages,
} from "@/lib/statuses/image-cache";
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

type OwnerProfile = {
  ownerId: string;
  displayName: string;
  jobTitle: string;
  avatarUrl: string;
  updatedAt: string;
};

const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  ownerId: "vichly-owner",
  displayName:
    process.env.NEXT_PUBLIC_OWNER_DISPLAY_NAME || "Toussaint Leo Vitch",
  jobTitle: process.env.NEXT_PUBLIC_OWNER_JOB_TITLE || "Entrepreneur",
  avatarUrl: process.env.NEXT_PUBLIC_OWNER_AVATAR_URL || "",
  updatedAt: "",
};

const IMAGE_STORY_DURATION_MS = 7000;
const TEXT_STORY_DURATION_MS = 7000;
const VIDEO_STORY_DURATION_MS = 15000;
const STATUS_VIEWER_SYNC_INTERVAL_MS = 30_000;
const PROGRESS_TICK_MS = 80;
const STATUS_SEEN_STORAGE_KEY = "vichly_seen_status_ids";
const PUBLIC_OWNER_PROFILE_CACHE_NAMESPACE = "vichly_public_owner_profile_cache";
const PUBLIC_OWNER_PROFILE_CACHE_KEY = createBrowserCacheKey(
  PUBLIC_OWNER_PROFILE_CACHE_NAMESPACE,
);
const PUBLIC_OWNER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_STATUSES_CACHE_NAMESPACE = "vichly_public_statuses_cache";
const PUBLIC_STATUSES_CACHE_KEY = createBrowserCacheKey(PUBLIC_STATUSES_CACHE_NAMESPACE);
const PUBLIC_STATUSES_CACHE_TTL_MS = 60 * 1000;
const PUBLIC_STATUSES_CACHE_MAX_BYTES = 96_000;
const PUBLIC_STATUSES_CACHE_MAX_ITEMS = 24;
const MAX_CACHED_STATUS_IMAGE_FILE_SIZE = 1_200_000;

function sortStatuses(statuses: PrivateStatusRecord[]) {
  return [...statuses].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function buildStatusesCachePayload(payload: StatusListResponse): StatusListResponse {
  return {
    ...payload,
    statuses: sortStatuses(payload.statuses).slice(-PUBLIC_STATUSES_CACHE_MAX_ITEMS),
  };
}

function formatStatusTimestamp(timestamp: string) {
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

  const timeLabel = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(targetDate);

  if (dayDiff === 0) {
    return `Aujourd'hui a ${timeLabel}`;
  }

  if (dayDiff === 1) {
    return `Hier a ${timeLabel}`;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(targetDate);
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

function getStoryDuration(status: PrivateStatusRecord | null) {
  if (!status) {
    return IMAGE_STORY_DURATION_MS;
  }

  if (status.type === "video") {
    return VIDEO_STORY_DURATION_MS;
  }

  if (status.type === "text") {
    return TEXT_STORY_DURATION_MS;
  }

  return IMAGE_STORY_DURATION_MS;
}

function getCaption(status: PrivateStatusRecord | null) {
  if (!status?.content) {
    return "";
  }

  return status.content.trim();
}

function markStatusAsSeen(statusId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(STATUS_SEEN_STORAGE_KEY);
    const parsedValue = rawValue ? (JSON.parse(rawValue) as unknown) : [];
    const seenIds = Array.isArray(parsedValue)
      ? parsedValue.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : [];

    if (!seenIds.includes(statusId)) {
      seenIds.push(statusId);
    }

    window.localStorage.setItem(
      STATUS_SEEN_STORAGE_KEY,
      JSON.stringify(seenIds.slice(-120)),
    );
  } catch {
    // Ignore storage failures.
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result) {
        resolve(reader.result);
        return;
      }

      reject(new Error("Conversion image impossible."));
    };

    reader.onerror = () => {
      reject(new Error("Conversion image impossible."));
    };

    reader.readAsDataURL(blob);
  });
}

export default function StatusesViewer() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<PrivateStatusRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [progressRatio, setProgressRatio] = useState(0);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(
    DEFAULT_OWNER_PROFILE,
  );
  const [cachedImageSources, setCachedImageSources] = useState<Record<string, string>>({});
  const viewedStatusIdsRef = useRef<Set<string>>(new Set());
  const preloadedStatusIdsRef = useRef<Set<string>>(new Set());

  async function loadStatuses(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/statuses", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Chargement des status impossible.");
      }

      const payload = (await response.json()) as StatusListResponse;
      writeBrowserCache(
        PUBLIC_STATUSES_CACHE_KEY,
        buildStatusesCachePayload(payload),
        PUBLIC_STATUSES_CACHE_TTL_MS,
        {
          maxBytes: PUBLIC_STATUSES_CACHE_MAX_BYTES,
        },
      );
      const nextStatuses = sortStatuses(payload.statuses);

      setStatuses(nextStatuses);
      setErrorMessage("");
      setActiveIndex((currentValue) => {
        if (!nextStatuses.length) {
          return null;
        }

        if (currentValue == null) {
          return 0;
        }

        return Math.min(currentValue, nextStatuses.length - 1);
      });
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
    void migrateLegacyStatusImageCacheToIndexedDb();

    removeOutdatedBrowserCacheVersions(PUBLIC_STATUSES_CACHE_NAMESPACE);
    const cachedStatuses = readBrowserCache<StatusListResponse>(PUBLIC_STATUSES_CACHE_KEY);

    if (cachedStatuses) {
      const nextStatuses = sortStatuses(cachedStatuses.statuses);
      setStatuses(nextStatuses);
      setActiveIndex((currentValue) => {
        if (!nextStatuses.length) {
          return null;
        }

        if (currentValue == null) {
          return 0;
        }

        return Math.min(currentValue, nextStatuses.length - 1);
      });
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
      }, STATUS_VIEWER_SYNC_INTERVAL_MS);
    };

    const handleFocus = () => {
      void loadStatuses({
        silent: true,
      });
      refreshPollingWindow();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadStatuses({
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
            maxBytes: 12_000,
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

  const activeStatus =
    activeIndex != null && activeIndex >= 0 ? statuses[activeIndex] || null : null;
  const activeImageSource =
    activeStatus?.type === "image"
      ? cachedImageSources[activeStatus.id] || activeStatus.storageUrl
      : null;

  useEffect(() => {
    if (!statuses.length) {
      setCachedImageSources({});
      return;
    }

    let isCancelled = false;

    async function hydrateCachedImages() {
      await pruneStatusImageCache(statuses);
      const nextCachedSources = await readCachedStatusImages(statuses);

      if (isCancelled) {
        return;
      }

      setCachedImageSources(nextCachedSources);
    }

    void hydrateCachedImages();

    return () => {
      isCancelled = true;
    };
  }, [statuses]);

  useEffect(() => {
    let isCancelled = false;

    async function preloadStatusImages() {
      const imageStatuses = statuses.filter((status) => status.type === "image");

      for (const status of imageStatuses) {
        if (
          cachedImageSources[status.id] ||
          preloadedStatusIdsRef.current.has(status.id) ||
          status.fileSize > MAX_CACHED_STATUS_IMAGE_FILE_SIZE
        ) {
          continue;
        }

        preloadedStatusIdsRef.current.add(status.id);

        try {
          const response = await fetch(status.storageUrl, {
            cache: "force-cache",
          });

          if (!response.ok) {
            continue;
          }

          const blob = await response.blob();

          if (blob.size > MAX_CACHED_STATUS_IMAGE_FILE_SIZE) {
            continue;
          }

          const dataUrl = await blobToDataUrl(blob);

          if (isCancelled || dataUrl.length > 2_000_000) {
            continue;
          }

          await cacheStatusImage(status, dataUrl);
          setCachedImageSources((currentValue) => ({
            ...currentValue,
            [status.id]: dataUrl,
          }));
        } catch {
          // Ignore fetch/cache failures.
        }
      }
    }

    void preloadStatusImages();

    return () => {
      isCancelled = true;
    };
  }, [cachedImageSources, statuses]);

  useEffect(() => {
    if (!activeStatus || viewedStatusIdsRef.current.has(activeStatus.id)) {
      return;
    }

    viewedStatusIdsRef.current.add(activeStatus.id);
    markStatusAsSeen(activeStatus.id);

    void fetch(`/api/statuses/${activeStatus.id}/view`, {
      method: "POST",
    }).then(async (response) => {
      if (!response.ok) {
        return;
      }

      await loadStatuses({
        silent: true,
      });
    });
  }, [activeStatus]);

  useEffect(() => {
    if (!activeStatus) {
      setProgressRatio(0);
      return;
    }

    const duration = getStoryDuration(activeStatus);
    const startedAt = Date.now();

    setProgressRatio(0);

    const intervalId = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const ratio = Math.min(elapsedMs / duration, 1);

      setProgressRatio(ratio);

      if (ratio < 1) {
        return;
      }

      window.clearInterval(intervalId);

      if (activeIndex == null || activeIndex >= statuses.length - 1) {
        router.push("/chat");
        return;
      }

      setActiveIndex(activeIndex + 1);
    }, PROGRESS_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeIndex, activeStatus, router, statuses.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setActiveIndex((currentValue) => {
          if (!statuses.length) {
            return null;
          }

          if (currentValue == null || currentValue <= 0) {
            return 0;
          }

          return currentValue - 1;
        });
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((currentValue) => {
          if (!statuses.length) {
            return null;
          }

          if (currentValue == null) {
            return 0;
          }

          return Math.min(currentValue + 1, statuses.length - 1);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [statuses.length]);

  function handlePrevious() {
    setActiveIndex((currentValue) => {
      if (!statuses.length) {
        return null;
      }

      if (currentValue == null || currentValue <= 0) {
        return 0;
      }

      return currentValue - 1;
    });
  }

  function handleNext() {
    setActiveIndex((currentValue) => {
      if (!statuses.length) {
        return null;
      }

      if (currentValue == null) {
        return 0;
      }

      return Math.min(currentValue + 1, statuses.length - 1);
    });
  }

  const caption = getCaption(activeStatus);

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">
      {activeStatus?.type === "image" ? (
        <Image
          src={activeImageSource || activeStatus.storageUrl}
          alt={activeStatus.content || "Statut image"}
          fill
          priority
          unoptimized
          className="pointer-events-none object-cover opacity-30 blur-3xl"
        />
      ) : null}

      {activeStatus?.type === "video" ? (
        <video
          src={activeStatus.storageUrl}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 blur-3xl"
          autoPlay
          muted
          loop
          playsInline
        />
      ) : null}

      {!activeStatus ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(22,163,74,0.16),transparent_28%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.14),transparent_30%),linear-gradient(180deg,#06090d_0%,#0b1118_100%)]" />
      ) : null}

      <div className="relative z-10 flex min-h-dvh flex-col">
        {isLoading ? (
          <div className="flex min-h-dvh flex-1 items-center justify-center px-6">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/8 px-5 py-3 text-sm font-medium text-white/88 backdrop-blur-xl">
              <LoaderCircle className="size-4 animate-spin" />
              Chargement des status...
            </div>
          </div>
        ) : errorMessage ? (
          <div className="flex min-h-dvh flex-1 items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-[2rem] border border-rose-300/20 bg-rose-500/10 px-6 py-6 text-center backdrop-blur-xl">
              <p className="text-base font-semibold text-rose-100">
                {errorMessage}
              </p>
              <Link
                href="/chat"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
              >
                <ArrowLeft className="size-4" />
                Retour au chat
              </Link>
            </div>
          </div>
        ) : statuses.length && activeStatus ? (
          <>
            <header className="relative z-20 px-3 pb-3 pt-3 md:px-6 md:pt-4">
              <div className="grid grid-cols-1 gap-1.5">
                {statuses.length ? (
                  <div className="flex gap-1.5">
                    {statuses.map((status, index) => {
                      const fillRatio =
                        index < activeIndex!
                          ? 1
                          : index === activeIndex
                            ? progressRatio
                            : 0;

                      return (
                        <span
                          key={status.id}
                          className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/20"
                        >
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-white"
                            style={{
                              width: `${fillRatio * 100}%`,
                            }}
                          />
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      href="/chat"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-xl transition-colors hover:bg-black/35"
                      aria-label="Retour au chat"
                    >
                      <ArrowLeft className="size-5" />
                    </Link>

                    <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                      {ownerProfile.avatarUrl ? (
                        <img
                          src={ownerProfile.avatarUrl}
                          alt={ownerProfile.displayName}
                          className="size-11 rounded-full object-cover"
                        />
                      ) : (
                        getInitials(ownerProfile.displayName)
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">
                        {ownerProfile.displayName}
                      </p>
                      <p className="truncate text-sm text-white/72">
                        {formatStatusTimestamp(activeStatus.createdAt)}
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/chat"
                    className="inline-flex size-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-xl transition-colors hover:bg-black/35"
                    aria-label="Fermer"
                  >
                    <X className="size-5" />
                  </Link>
                </div>
              </div>
            </header>

            <div className="relative flex flex-1 items-center justify-center px-3 pb-28 pt-2 md:px-10 md:pb-32">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={activeIndex === 0}
                className="absolute left-3 top-1/2 z-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/90 backdrop-blur-xl transition-colors hover:bg-black/45 disabled:cursor-not-allowed disabled:opacity-35 md:inline-flex"
                aria-label="Statut precedent"
              >
                <ChevronLeft className="size-6" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={activeIndex === statuses.length - 1}
                className="absolute right-3 top-1/2 z-20 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/90 backdrop-blur-xl transition-colors hover:bg-black/45 disabled:cursor-not-allowed disabled:opacity-35 md:inline-flex"
                aria-label="Statut suivant"
              >
                <ChevronRight className="size-6" />
              </button>

              <div className="absolute inset-y-0 left-0 z-10 w-1/2 md:hidden">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="h-full w-full"
                  aria-label="Zone tactile precedente"
                />
              </div>

              <div className="absolute inset-y-0 right-0 z-10 w-1/2 md:hidden">
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-full w-full"
                  aria-label="Zone tactile suivante"
                />
              </div>

              <div className="relative z-20 flex h-[70dvh] w-full max-w-[440px] items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-black/18 shadow-[0_35px_100px_rgba(0,0,0,0.42)] backdrop-blur-2xl md:h-[78dvh]">
                {activeStatus.type === "text" ? (
                  <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.28),transparent_28%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.2),transparent_30%),linear-gradient(165deg,#0b1118_0%,#111827_48%,#0f172a_100%)] px-8 text-center">
                    <p className="max-w-md text-2xl font-semibold leading-relaxed text-white md:text-4xl">
                      {activeStatus.content}
                    </p>
                  </div>
                ) : null}

                {activeStatus.type === "image" ? (
                  <Image
                    src={activeImageSource || activeStatus.storageUrl}
                    alt={activeStatus.content || "Statut image"}
                    width={1280}
                    height={1920}
                    priority
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : null}

                {activeStatus.type === "video" ? (
                  <video
                    src={activeStatus.storageUrl}
                    className="h-full w-full object-cover"
                    autoPlay
                    controls
                    playsInline
                  />
                ) : null}

                {caption && activeStatus.type !== "text" ? (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-3xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-xl">
                    <p className="text-sm leading-relaxed text-white/92">
                      {caption}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-dvh flex-1 items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/6 px-6 py-7 text-center backdrop-blur-2xl">
              <p className="text-xl font-semibold text-white">
                Aucun status actif pour le moment.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/68">
                Quand {ownerProfile.displayName} publiera un nouveau status, il
                apparaitra ici automatiquement.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#0b1118]"
                >
                  <ArrowLeft className="size-4" />
                  Retour au chat
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
