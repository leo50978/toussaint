"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, PlusSquare, Share, Smartphone, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const PROMPT_DISMISSED_KEY = "vichly_pwa_install_prompt_dismissed_v1";
const PROMPT_INSTALLED_KEY = "vichly_pwa_install_prompt_installed_v1";

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone =
    typeof navigator !== "undefined" &&
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return mediaStandalone || navigatorStandalone;
}

function isMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [installationMode, setInstallationMode] = useState<
    "native" | "ios" | "unsupported"
  >("unsupported");

  const canAutoInstall = installationMode === "native" && Boolean(deferredPrompt);

  const helperText = useMemo(() => {
    if (installationMode === "ios") {
      return "Sur iPhone, utilise le bouton Partager puis choisis Ajouter a l ecran d accueil pour installer l application.";
    }

    if (installationMode === "native") {
      return "Installe l application pour profiter d une ouverture plus rapide, d une interface plein ecran et d une experience mobile plus stable.";
    }

    return "L installation n est pas disponible automatiquement sur ce navigateur. Tu peux continuer sur la version web.";
  }, [installationMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setHasMounted(true);

    if (isStandaloneMode() || !isMobileDevice()) {
      return;
    }

    if (window.localStorage.getItem(PROMPT_INSTALLED_KEY) === "1") {
      return;
    }

    if (window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "1") {
      return;
    }

    if (isIosDevice()) {
      setInstallationMode("ios");
      setIsVisible(true);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallationMode("native");
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      window.localStorage.setItem(PROMPT_INSTALLED_KEY, "1");
      setDeferredPrompt(null);
      setIsVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    const timerId = window.setTimeout(() => {
      setInstallationMode((currentValue) =>
        currentValue === "unsupported" ? "unsupported" : currentValue,
      );
      setIsVisible((currentValue) => currentValue || !Boolean(deferredPrompt));
    }, 1800);

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!hasMounted || isStandaloneMode() || !isMobileDevice()) {
      return;
    }

    if (isIosDevice()) {
      setInstallationMode("ios");
      return;
    }

    if (deferredPrompt) {
      setInstallationMode("native");
    }
  }, [deferredPrompt, hasMounted]);

  if (!hasMounted || !isVisible || isStandaloneMode() || !isMobileDevice()) {
    return null;
  }

  const dismissPrompt = () => {
    window.localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    setIsVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "accepted") {
        window.localStorage.setItem(PROMPT_INSTALLED_KEY, "1");
        setIsVisible(false);
      }
    } finally {
      setDeferredPrompt(null);
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-sm md:items-center md:px-6 md:pb-6">
      <div className="w-full max-w-md rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,20,24,0.96),rgba(8,12,15,0.95))] p-5 text-white shadow-[0_35px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-emerald-200">
            <Smartphone className="size-5" />
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            className="inline-flex size-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Fermer"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="mt-4">
          <p className="text-lg font-semibold text-slate-50">
            Installe Vichly Messenger
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Pour profiter pleinement de l application sur mobile, installe la
            version PWA. Tu auras un acces plus direct, une experience plus
            fluide en plein ecran et un usage plus proche d une vraie app.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {helperText}
          </p>
        </div>

        {installationMode === "ios" ? (
          <div className="mt-4 rounded-[1.15rem] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
            <div className="flex items-center gap-2">
              <Share className="size-4 text-slate-300" />
              <span>1. Appuie sur Partager dans Safari</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <PlusSquare className="size-4 text-slate-300" />
              <span>2. Choisis Ajouter a l ecran d accueil</span>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={dismissPrompt}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
          >
            Plus tard
          </button>

          {canAutoInstall ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={isInstalling}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#06251c] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Download className="size-4" />
              {isInstalling ? "Installation..." : "Installer l app"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
