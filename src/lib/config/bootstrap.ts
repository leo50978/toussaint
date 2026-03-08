import { getOwnerAuthConfig } from "@/lib/auth/owner-session";
import { getChatRuntimeConfig, getChatRuntimeStatus } from "@/lib/chat/runtime";
import { getFirestoreDataModelSummary } from "@/lib/firestore";
import {
  getFirebasePublicConfig,
  getFirebasePublicConfigStatus,
  getResolvedFirebaseStorageBucket,
} from "@/lib/firebase/config";

const OPENAI_API_KEY_PLACEHOLDER = "OPENAI_API_KEY_PLACEHOLDER";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export type BootstrapCheck = {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
};

export function getOpenAiRuntime() {
  const apiKey = process.env.OPENAI_API_KEY || OPENAI_API_KEY_PLACEHOLDER;
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const isConfigured =
    Boolean(process.env.OPENAI_API_KEY) && apiKey !== OPENAI_API_KEY_PLACEHOLDER;

  return {
    apiKey,
    model,
    isConfigured,
  };
}

function hasFirebaseAdminConfig(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function getBootstrapChecklist(): BootstrapCheck[] {
  const firebaseConfig = getFirebasePublicConfig();
  const firebaseStatus = getFirebasePublicConfigStatus();
  const chatRuntime = getChatRuntimeStatus();
  const chatRuntimeConfig = getChatRuntimeConfig();
  const dataModel = getFirestoreDataModelSummary();
  const ownerConfig = getOwnerAuthConfig();
  const openAiRuntime = getOpenAiRuntime();

  return [
    {
      id: "firebase-client",
      label: "Firebase client",
      ready: true,
      detail: firebaseStatus.usingFallbackDefaults
        ? `Actif via les valeurs par defaut du projet ${firebaseConfig.projectId}.`
        : "Actif via variables d environnement.",
    },
    {
      id: "firestore",
      label: "Firestore SDK",
      ready: true,
      detail: "Le SDK client peut initialiser la base temps reel pour les conversations.",
    },
    {
      id: "data-model",
      label: "Modele Firestore",
      ready: true,
      detail: `${dataModel.counts.collections} collections et ${dataModel.counts.indexes} index composites sont definis.`,
    },
    {
      id: "messaging-runtime",
      label: "Chat temps reel",
      ready: chatRuntime.realtime,
      detail: `Runtime ${chatRuntime.mode} actif pour l owner ${chatRuntimeConfig.ownerId}.`,
    },
    {
      id: "private-drafts",
      label: "Brouillons prives",
      ready: true,
      detail: "Module owner-only actif avec autosave et sync multi-session.",
    },
    {
      id: "statuses",
      label: "Statuts 24h",
      ready: true,
      detail: "Module statuts actif avec media stocke cote serveur et expiration automatique.",
    },
    {
      id: "storage",
      label: "Firebase Storage",
      ready: Boolean(getResolvedFirebaseStorageBucket()),
      detail: `Bucket cible: ${getResolvedFirebaseStorageBucket()}.`,
    },
    {
      id: "firebase-admin",
      label: "Firebase Admin SDK",
      ready: hasFirebaseAdminConfig(),
      detail: hasFirebaseAdminConfig()
        ? "Les credentials serveur sont presents."
        : "Ajoute le service account dans .env.local pour les routes backend.",
    },
    {
      id: "owner-auth",
      label: "Auth proprietaire",
      ready: !ownerConfig.isWeakSecret && ownerConfig.setupTokenConfigured,
      detail: ownerConfig.isWeakSecret
        ? "Firebase Auth actif, mais OWNER_AUTH_SECRET est faible. Utilise au moins 32 caracteres."
        : ownerConfig.setupTokenConfigured
          ? "Firebase Auth actif avec secret de session personnalise et token de setup configure."
          : "Firebase Auth actif, mais OWNER_SETUP_TOKEN manque encore.",
    },
    {
      id: "openai",
      label: "API OpenAI",
      ready: openAiRuntime.isConfigured,
      detail: openAiRuntime.isConfigured
        ? `Cle configuree. Modele par defaut: ${openAiRuntime.model}. Suggestion manuelle active cote owner.`
        : `Placeholder actif. Le dashboard utilisera un fallback local avec le modele ${openAiRuntime.model}.`,
    },
  ];
}
