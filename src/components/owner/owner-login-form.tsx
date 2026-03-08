"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth";
import { ArrowRight, KeyRound, LoaderCircle, UserPlus } from "lucide-react";

import { getFirebaseBrowserServices } from "@/lib/firebase/client";

type OwnerAuthStateResponse = {
  initialized?: boolean;
  requiresSetup?: boolean;
  ownerEmail?: string | null;
  adminConfigured?: boolean;
  setupTokenConfigured?: boolean;
  error?: string;
};

type ApiErrorResponse = {
  error?: string;
};

type OwnerAuthMode = "loading" | "setup" | "login";

function mapFirebaseAuthError(
  error: unknown,
  fallbackMessage: string,
  options?: {
    host?: string;
  },
) {
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  if (errorCode === "auth/email-already-in-use") {
    return "Cet email est deja utilise.";
  }

  if (errorCode === "auth/invalid-email") {
    return "Adresse email invalide.";
  }

  if (errorCode === "auth/weak-password") {
    return "Mot de passe trop faible (minimum 6 caracteres).";
  }

  if (errorCode === "auth/invalid-credential") {
    return "Identifiants invalides.";
  }

  if (errorCode === "auth/user-not-found") {
    return "Compte introuvable.";
  }

  if (errorCode === "auth/wrong-password") {
    return "Mot de passe incorrect.";
  }

  if (errorCode === "auth/too-many-requests") {
    return "Trop de tentatives. Reessaye plus tard.";
  }

  if (errorCode === "auth/operation-not-allowed") {
    return "La methode Email/Mot de passe n est pas activee dans Firebase Auth.";
  }

  if (errorCode === "auth/configuration-not-found") {
    return "La configuration Firebase Auth est incomplete pour ce projet.";
  }

  if (errorCode === "auth/network-request-failed") {
    const normalizedHost = options?.host?.trim() || "";

    return normalizedHost
      ? `Connexion Firebase impossible. Verifie internet, active Email/Mot de passe dans Firebase Auth et ajoute ${normalizedHost} dans Authentication > Settings > Authorized domains.`
      : "Connexion Firebase impossible. Verifie internet, active Email/Mot de passe dans Firebase Auth et controle les Authorized domains.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
}

function getFirebaseAuthClient() {
  const { auth } = getFirebaseBrowserServices();

  return auth as Auth;
}

export default function OwnerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authMode, setAuthMode] = useState<OwnerAuthMode>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [setupTokenConfigured, setSetupTokenConfigured] = useState(true);
  const [submissionMode, setSubmissionMode] = useState<"setup" | "login" | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentHost =
    typeof window !== "undefined" ? window.location.hostname || window.location.host : "";
  const isBusy = isPending || submissionMode !== null;

  useEffect(() => {
    let isCancelled = false;

    async function loadOwnerAuthState() {
      try {
        const response = await fetch("/api/owner/auth/state", {
          cache: "no-store",
        });

        const payload = (await response.json()) as OwnerAuthStateResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Lecture de l etat owner impossible.");
        }

        if (isCancelled) {
          return;
        }

        const requiresSetup = Boolean(payload.requiresSetup);
        setAuthMode(requiresSetup ? "setup" : "login");
        setAdminConfigured(payload.adminConfigured !== false);
        setSetupTokenConfigured(payload.setupTokenConfigured !== false);

        if (typeof payload.ownerEmail === "string" && payload.ownerEmail.trim()) {
          setEmail(payload.ownerEmail.trim().toLowerCase());
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setAuthMode("login");
        setAdminConfigured(false);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Verification du compte owner impossible.",
        );
      }
    }

    void loadOwnerAuthState();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");

    if (password.length < 6) {
      setErrorMessage("Le mot de passe doit contenir au moins 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("La confirmation ne correspond pas.");
      return;
    }

    if (!adminConfigured) {
      setErrorMessage(
        "Firebase Admin n est pas configure sur le serveur. Ajoute FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY dans .env.local.",
      );
      return;
    }

    if (!setupTokenConfigured) {
      setErrorMessage(
        "OWNER_SETUP_TOKEN n est pas configure sur le serveur. Renseigne-le avant de creer le compte owner.",
      );
      return;
    }

    if (!setupToken.trim()) {
      setErrorMessage("Le token de setup owner est obligatoire.");
      return;
    }

    setSubmissionMode("setup");

    try {
      const authClient = getFirebaseAuthClient();
      const normalizedEmail = email.trim().toLowerCase();
      const credential = await (async () => {
        try {
          return await createUserWithEmailAndPassword(
            authClient,
            normalizedEmail,
            password,
          );
        } catch (error) {
          const errorCode =
            error && typeof error === "object" && "code" in error
              ? String((error as { code?: unknown }).code || "")
              : "";

          if (errorCode !== "auth/email-already-in-use") {
            throw error;
          }

          return signInWithEmailAndPassword(authClient, normalizedEmail, password);
        }
      })();
      const idToken = await credential.user.getIdToken(true);

      const response = await fetch("/api/owner/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-owner-setup-token": setupToken.trim(),
        },
        body: JSON.stringify({
          idToken,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || "Creation du compte owner impossible.");
      }

      await signOut(authClient).catch(() => undefined);

      setAuthMode("login");
      setPassword("");
      setConfirmPassword("");
      setSetupToken("");
      setStatusMessage("Compte cree. Connecte-toi pour acceder a l espace owner.");
    } catch (error) {
      setErrorMessage(
        mapFirebaseAuthError(error, "Creation du compte owner impossible.", {
          host: currentHost,
        }),
      );
    } finally {
      setSubmissionMode(null);
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setSubmissionMode("login");

    try {
      const authClient = getFirebaseAuthClient();
      const credential = await signInWithEmailAndPassword(
        authClient,
        email.trim(),
        password,
      );
      const idToken = await credential.user.getIdToken(true);

      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorResponse;
        throw new Error(body.error || "Connexion impossible.");
      }

      setStatusMessage("Connexion reussie. Redirection vers l espace owner...");

      const nextPath = searchParams.get("next");
      const safeNextPath =
        nextPath && nextPath.startsWith("/") ? nextPath : "/owner";

      startTransition(() => {
        router.replace(safeNextPath);
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(
        mapFirebaseAuthError(error, "Connexion impossible.", {
          host: currentHost,
        }),
      );
    } finally {
      setSubmissionMode(null);
    }
  }

  if (authMode === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-300">
        <LoaderCircle className="size-4 animate-spin text-emerald-300" />
        Verification de l etat du compte owner...
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={authMode === "setup" ? handleSetupSubmit : handleLoginSubmit}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-200">
          Email proprietaire
        </span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400/45 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="owner@ton-domaine.com"
          autoComplete="email"
          disabled={isBusy}
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-200">
          Mot de passe
        </span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400/45 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="********"
          autoComplete={authMode === "setup" ? "new-password" : "current-password"}
          disabled={isBusy}
          required
        />
      </label>

      {authMode === "setup" ? (
        <>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">
              Confirmation du mot de passe
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400/45 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="********"
              autoComplete="new-password"
              disabled={isBusy}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">
              Token de setup owner
            </span>
            <input
              type="password"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-400/45 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Token de setup"
              autoComplete="one-time-code"
              disabled={isBusy}
              required
            />
          </label>
        </>
      ) : null}

      {isBusy ? (
        <p className="flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          <LoaderCircle className="size-4 animate-spin" />
          {submissionMode === "setup"
            ? "Creation du compte owner en cours..."
            : isPending
              ? "Ouverture de l espace owner..."
              : "Connexion owner en cours..."}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/12 px-4 py-3 text-sm text-emerald-100">
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-2xl border border-rose-400/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      {!adminConfigured ? (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-500/12 px-4 py-3 text-sm text-amber-100">
          Setup owner bloque: le serveur n a pas encore les credentials Firebase Admin.
        </p>
      ) : null}

      {authMode === "setup" && !setupTokenConfigured ? (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-500/12 px-4 py-3 text-sm text-amber-100">
          Setup owner bloque: configure aussi `OWNER_SETUP_TOKEN` sur le serveur.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          isBusy ||
          (authMode === "setup" && (!adminConfigured || !setupTokenConfigured))
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#005c4b] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {authMode === "setup" ? (
          isBusy ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Creation en cours...
            </>
          ) : (
            <>
              Creer mon compte owner
              <UserPlus className="size-4" />
            </>
          )
        ) : (
          isBusy ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              {isPending ? "Ouverture..." : "Connexion..."}
            </>
          ) : (
            <>
              Se connecter
              <ArrowRight className="size-4" />
            </>
          )
        )}
      </button>

      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs leading-relaxed text-slate-300">
        {authMode === "setup" ? (
          <>
            Cette fenetre de creation n apparaitra qu une seule fois.
            Une fois le compte cree, seule la connexion sera proposee.
          </>
        ) : (
          <>
            Le compte owner est deja initialise. Utilise tes identifiants Firebase
            pour te connecter et acceder aux dashboards admin.
          </>
        )}
        <span className="mt-2 block font-semibold text-slate-100">
          <KeyRound className="mr-1 inline size-3.5" />
          Authentification Firebase + session HTTP-only signee.
        </span>
      </div>
    </form>
  );
}
