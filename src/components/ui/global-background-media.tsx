"use client";

import { useEffect, useRef, useState } from "react";

type GlobalBackgroundMediaProps = {
  videoSrc: string;
};

type NavigatorConnection = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function bindMediaQueryListener(
  query: MediaQueryList,
  listener: () => void,
) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);

    return () => {
      query.removeEventListener("change", listener);
    };
  }

  query.addListener(listener);

  return () => {
    query.removeListener(listener);
  };
}

export default function GlobalBackgroundMedia({
  videoSrc,
}: GlobalBackgroundMediaProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldEnableVideo, setShouldEnableVideo] = useState(false);
  const [shouldMountVideo, setShouldMountVideo] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: NavigatorConnection;
      }
    ).connection;

    const syncVideoPolicy = () => {
      const effectiveType = connection?.effectiveType?.toLowerCase() || "";
      const shouldAvoidVideo =
        motionQuery.matches ||
        Boolean(connection?.saveData) ||
        effectiveType === "slow-2g" ||
        effectiveType === "2g";

      setShouldEnableVideo(!shouldAvoidVideo);
    };

    syncVideoPolicy();

    const unsubscribeMotion = bindMediaQueryListener(motionQuery, syncVideoPolicy);
    connection?.addEventListener?.("change", syncVideoPolicy);

    return () => {
      unsubscribeMotion();
      connection?.removeEventListener?.("change", syncVideoPolicy);
    };
  }, []);

  useEffect(() => {
    if (!shouldEnableVideo) {
      setShouldMountVideo(false);
      setIsVideoReady(false);
      videoRef.current?.pause();
      return;
    }

    const idleWindow = window as IdleWindow;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const mountVideo = () => {
      setShouldMountVideo(true);
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(() => {
        mountVideo();
      }, {
        timeout: 1400,
      });
    } else {
      timeoutId = window.setTimeout(() => {
        mountVideo();
      }, 900);
    }

    return () => {
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId);
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldEnableVideo]);

  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const syncViewportSize = () => {
      const nextWidth = Math.round(viewport?.width || window.innerWidth);
      const nextHeight = Math.round(viewport?.height || window.innerHeight);

      root.style.setProperty("--app-screen-width", `${nextWidth}px`);
      root.style.setProperty("--app-screen-height", `${nextHeight}px`);
    };

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    window.addEventListener("orientationchange", syncViewportSize);
    viewport?.addEventListener("resize", syncViewportSize);
    viewport?.addEventListener("scroll", syncViewportSize);

    return () => {
      window.removeEventListener("resize", syncViewportSize);
      window.removeEventListener("orientationchange", syncViewportSize);
      viewport?.removeEventListener("resize", syncViewportSize);
      viewport?.removeEventListener("scroll", syncViewportSize);
    };
  }, []);

  useEffect(() => {
    if (!shouldMountVideo) {
      videoRef.current?.pause();
      return;
    }

    const activeVideo = videoRef.current;

    const syncPlayback = () => {
      const video = activeVideo;

      if (!video) {
        return;
      }

      if (document.visibilityState === "hidden") {
        video.pause();
        return;
      }

      const playback = video.play();

      if (playback && typeof playback.catch === "function") {
        void playback.catch(() => undefined);
      }
    };

    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);

    return () => {
      document.removeEventListener("visibilitychange", syncPlayback);
      activeVideo?.pause();
    };
  }, [shouldMountVideo]);

  return (
    <div aria-hidden="true" className="global-video-background">
      <div
        className={`global-video-background__poster ${
          isVideoReady ? "global-video-background__poster--ready" : ""
        }`}
      />
      {shouldMountVideo ? (
        <video
          ref={videoRef}
          className="global-video-background__media"
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={() => setIsVideoReady(true)}
          preload="none"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
