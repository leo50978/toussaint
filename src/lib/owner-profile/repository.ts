import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";

export type OwnerProfileRecord = {
  ownerId: string;
  displayName: string;
  jobTitle: string;
  avatarUrl: string;
  aiBusinessContext: string;
  aiAttentionKeywords: string[];
  updatedAt: string;
};

export type PublicOwnerProfileRecord = Omit<
  OwnerProfileRecord,
  "aiBusinessContext" | "aiAttentionKeywords"
>;

const OWNER_PROFILE_DATA_DIR = join(process.cwd(), "data");
const OWNER_PROFILE_DATA_FILE = join(OWNER_PROFILE_DATA_DIR, "owner-profile.json");
const OWNER_PROFILE_COLLECTION = "ownerProfiles";
const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

function getNowIso() {
  return new Date().toISOString();
}

function getDefaultOwnerProfile(): OwnerProfileRecord {
  return {
    ownerId: DEFAULT_OWNER_ID,
    displayName:
      process.env.OWNER_DISPLAY_NAME ||
      process.env.NEXT_PUBLIC_OWNER_DISPLAY_NAME ||
      "Toussaint Leo Vitch",
    jobTitle:
      process.env.OWNER_JOB_TITLE ||
      process.env.NEXT_PUBLIC_OWNER_JOB_TITLE ||
      "Entrepreneur",
    avatarUrl:
      process.env.OWNER_AVATAR_URL ||
      process.env.NEXT_PUBLIC_OWNER_AVATAR_URL ||
      "",
    aiBusinessContext:
      process.env.OWNER_BUSINESS_CONTEXT ||
      "Tu aides Toussaint Leo Vitch, developpeur web. Il cree des sites web, des applications web, des dashboards, des API et tout service lie au web.",
    aiAttentionKeywords: [],
    updatedAt: getNowIso(),
  };
}

function normalizeText(value: unknown, maxLength: number, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().slice(0, maxLength);

  return normalized || fallback;
}

function normalizeAvatarUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const rawValue = value.trim();

  if (!rawValue) {
    return "";
  }

  const normalized = rawValue.startsWith("data:image/")
    ? rawValue.slice(0, 2_500_000)
    : rawValue.slice(0, 600);

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:image/")
  ) {
    return normalized;
  }

  return "";
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter(Boolean),
  )].slice(0, 40);
}

function normalizeOwnerProfile(input: unknown): OwnerProfileRecord {
  const defaults = getDefaultOwnerProfile();

  if (!input || typeof input !== "object") {
    return defaults;
  }

  const candidate = input as Partial<OwnerProfileRecord>;

  return {
    ownerId:
      typeof candidate.ownerId === "string" && candidate.ownerId.trim()
        ? candidate.ownerId.trim()
        : defaults.ownerId,
    displayName: normalizeText(candidate.displayName, 80, defaults.displayName),
    jobTitle: normalizeText(candidate.jobTitle, 120, defaults.jobTitle),
    avatarUrl: normalizeAvatarUrl(candidate.avatarUrl),
    aiBusinessContext:
      typeof candidate.aiBusinessContext === "string"
        ? candidate.aiBusinessContext.trim().slice(0, 2_000)
        : defaults.aiBusinessContext,
    aiAttentionKeywords: normalizeKeywords(candidate.aiAttentionKeywords),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : defaults.updatedAt,
  };
}

type FirestoreLikeDb = {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
    };
  };
};

function getFirestoreDb(): FirestoreLikeDb | null {
  if (!hasFirebaseAdminConfig()) {
    return null;
  }

  try {
    const { db } = getFirebaseAdminServices();
    const candidate = db as unknown as FirestoreLikeDb;

    if (!candidate || typeof candidate.collection !== "function") {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

async function readOwnerProfileFromFirestore(db: FirestoreLikeDb) {
  const snapshot = await db
    .collection(OWNER_PROFILE_COLLECTION)
    .doc(DEFAULT_OWNER_ID)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return normalizeOwnerProfile({
    ownerId: DEFAULT_OWNER_ID,
    ...(snapshot.data() || {}),
  });
}

async function writeOwnerProfileToFirestore(
  db: FirestoreLikeDb,
  profile: OwnerProfileRecord,
) {
  const normalizedProfile = normalizeOwnerProfile(profile);

  await db
    .collection(OWNER_PROFILE_COLLECTION)
    .doc(DEFAULT_OWNER_ID)
    .set(normalizedProfile, { merge: true });

  return normalizedProfile;
}

async function ensureOwnerProfileFile() {
  await fs.mkdir(OWNER_PROFILE_DATA_DIR, {
    recursive: true,
  });

  try {
    await fs.access(OWNER_PROFILE_DATA_FILE);
  } catch {
    await fs.writeFile(
      OWNER_PROFILE_DATA_FILE,
      JSON.stringify(getDefaultOwnerProfile(), null, 2),
      "utf8",
    );
  }
}

async function readOwnerProfileFile() {
  await ensureOwnerProfileFile();

  try {
    const raw = await fs.readFile(OWNER_PROFILE_DATA_FILE, "utf8");

    return normalizeOwnerProfile(JSON.parse(raw));
  } catch {
    const fallbackProfile = getDefaultOwnerProfile();
    await fs.writeFile(
      OWNER_PROFILE_DATA_FILE,
      JSON.stringify(fallbackProfile, null, 2),
      "utf8",
    );

    return fallbackProfile;
  }
}

async function writeOwnerProfileFile(profile: OwnerProfileRecord) {
  const normalizedProfile = normalizeOwnerProfile(profile);

  await ensureOwnerProfileFile();
  await fs.writeFile(
    OWNER_PROFILE_DATA_FILE,
    JSON.stringify(normalizedProfile, null, 2),
    "utf8",
  );

  return normalizedProfile;
}

export async function getOwnerProfile() {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return readOwnerProfileFile();
  }

  const firestoreProfile = await readOwnerProfileFromFirestore(firestoreDb);

  if (firestoreProfile) {
    return firestoreProfile;
  }

  const fallbackProfile = await readOwnerProfileFile();
  await writeOwnerProfileToFirestore(firestoreDb, fallbackProfile);
  return fallbackProfile;
}

export async function getPublicOwnerProfile(): Promise<PublicOwnerProfileRecord> {
  const profile = await getOwnerProfile();

  return {
    ownerId: profile.ownerId,
    displayName: profile.displayName,
    jobTitle: profile.jobTitle,
    avatarUrl: profile.avatarUrl,
    updatedAt: profile.updatedAt,
  };
}

export async function updateOwnerProfile(
  input: Partial<
    Pick<
      OwnerProfileRecord,
      "displayName" | "jobTitle" | "avatarUrl" | "aiBusinessContext" | "aiAttentionKeywords"
    >
  >,
) {
  const currentProfile = await getOwnerProfile();
  const nextProfile = normalizeOwnerProfile({
    ...currentProfile,
    displayName:
      typeof input.displayName === "string"
        ? input.displayName
        : currentProfile.displayName,
    jobTitle:
      typeof input.jobTitle === "string" ? input.jobTitle : currentProfile.jobTitle,
    avatarUrl:
      typeof input.avatarUrl === "string" ? input.avatarUrl : currentProfile.avatarUrl,
    aiBusinessContext:
      typeof input.aiBusinessContext === "string"
        ? input.aiBusinessContext
        : currentProfile.aiBusinessContext,
    aiAttentionKeywords:
      Array.isArray(input.aiAttentionKeywords)
        ? input.aiAttentionKeywords
        : currentProfile.aiAttentionKeywords,
    updatedAt: getNowIso(),
  });

  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return writeOwnerProfileFile(nextProfile);
  }

  return writeOwnerProfileToFirestore(firestoreDb, nextProfile);
}
