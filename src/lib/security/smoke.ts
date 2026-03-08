import "server-only";

import { getOwnerAuthConfig } from "@/lib/auth/owner-session";
import { getSuggestionRateLimitConfig } from "@/lib/ai/rate-limit";
import { getSecurityRateLimitBackend } from "@/lib/security/rate-limiter";
import { hasFirebaseAdminConfig } from "@/lib/firebase/admin";

export function getSecuritySmokeChecklist() {
  const ownerAuth = getOwnerAuthConfig();

  return [
    {
      id: "firebase-admin",
      label: "Firebase Admin configure",
      ready: hasFirebaseAdminConfig(),
      detail: hasFirebaseAdminConfig()
        ? "Firestore et Storage serveur sont accessibles."
        : "Les credentials Admin manquent encore.",
    },
    {
      id: "owner-session-secret",
      label: "Session owner durcie",
      ready: !ownerAuth.isWeakSecret,
      detail: ownerAuth.isWeakSecret
        ? "OWNER_AUTH_SECRET doit etre renseigne avec au moins 32 caracteres."
        : ownerAuth.acceptingLegacyDefault
          ? "Secret courant fort actif avec acceptation temporaire d un secret legacy."
          : "Secret courant fort actif.",
    },
    {
      id: "owner-setup-token",
      label: "Setup owner verrouille",
      ready: ownerAuth.setupTokenConfigured,
      detail: ownerAuth.setupTokenConfigured
        ? "Le setup owner exige un token serveur."
        : "OWNER_SETUP_TOKEN n est pas configure.",
    },
    {
      id: "system-endpoints",
      label: "Endpoints system fermes",
      ready: process.env.PUBLIC_SYSTEM_ENDPOINTS !== "true",
      detail:
        process.env.PUBLIC_SYSTEM_ENDPOINTS === "true"
          ? "Les endpoints /api/system/* sont ouverts explicitement."
          : "Les endpoints /api/system/* sont fermes par defaut.",
    },
    {
      id: "security-rate-limit",
      label: "Rate limiting durable",
      ready: getSecurityRateLimitBackend() === "firestore",
      detail:
        getSecurityRateLimitBackend() === "firestore"
          ? "Les buckets de securite sont persistants dans Firestore."
          : "Fallback memoire actif, reserve au secours local.",
    },
    {
      id: "ai-rate-limit",
      label: "Rate limiting IA",
      ready: true,
      detail: `Fenetre ${Math.round(getSuggestionRateLimitConfig().windowMs / 1000)}s, limite ${getSuggestionRateLimitConfig().limit} requetes.`,
    },
  ];
}
