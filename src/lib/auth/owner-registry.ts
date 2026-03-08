import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";

const OWNER_AUTH_DATA_DIR = join(process.cwd(), "data");
const OWNER_AUTH_DATA_FILE = join(OWNER_AUTH_DATA_DIR, "owner-auth.json");
const OWNER_AUTH_LOCK_FILE = join(OWNER_AUTH_DATA_DIR, "owner-auth.lock");
const OWNER_SECURITY_COLLECTION = "ownerSecurity";
const OWNER_SECURITY_DOCUMENT_ID = "primary";

type OwnerRegistryFile = {
  version: 1;
  initialized: boolean;
  ownerUid: string;
  ownerEmail: string;
  createdAt: string | null;
  setupCompletedAt: string | null;
  updatedAt: string;
};

export type OwnerAuthState = {
  initialized: boolean;
  ownerUid: string | null;
  ownerEmail: string | null;
  createdAt: string | null;
  setupCompletedAt: string | null;
  updatedAt: string;
};

type OwnerIdentityInput = {
  uid: string;
  email: string;
};

type FirestoreDocSnapshot = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

type FirestoreLikeDb = {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<FirestoreDocSnapshot>;
      set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
    };
  };
};

function getNowIso() {
  return new Date().toISOString();
}

function getEmptyRegistryFile(): OwnerRegistryFile {
  return {
    version: 1,
    initialized: false,
    ownerUid: "",
    ownerEmail: "",
    createdAt: null,
    setupCompletedAt: null,
    updatedAt: getNowIso(),
  };
}

function normalizeRegistryFile(input: unknown): OwnerRegistryFile {
  if (!input || typeof input !== "object") {
    return getEmptyRegistryFile();
  }

  const candidate = input as Partial<OwnerRegistryFile>;
  const initialized = Boolean(candidate.initialized);
  const ownerUid =
    typeof candidate.ownerUid === "string" ? candidate.ownerUid.trim() : "";
  const ownerEmail =
    typeof candidate.ownerEmail === "string"
      ? candidate.ownerEmail.trim().toLowerCase()
      : "";
  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt
      ? candidate.createdAt
      : null;
  const setupCompletedAt =
    typeof candidate.setupCompletedAt === "string" && candidate.setupCompletedAt
      ? candidate.setupCompletedAt
      : createdAt;

  if (initialized && (!ownerUid || !ownerEmail || !createdAt)) {
    return getEmptyRegistryFile();
  }

  return {
    version: 1,
    initialized,
    ownerUid: initialized ? ownerUid : "",
    ownerEmail: initialized ? ownerEmail : "",
    createdAt: initialized ? createdAt : null,
    setupCompletedAt: initialized ? setupCompletedAt : null,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : getNowIso(),
  };
}

function toOwnerAuthState(registryFile: OwnerRegistryFile): OwnerAuthState {
  return {
    initialized: registryFile.initialized,
    ownerUid: registryFile.initialized ? registryFile.ownerUid : null,
    ownerEmail: registryFile.initialized ? registryFile.ownerEmail : null,
    createdAt: registryFile.initialized ? registryFile.createdAt : null,
    setupCompletedAt: registryFile.initialized ? registryFile.setupCompletedAt : null,
    updatedAt: registryFile.updatedAt,
  };
}

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

async function ensureOwnerRegistryFile() {
  await fs.mkdir(OWNER_AUTH_DATA_DIR, {
    recursive: true,
  });

  try {
    await fs.access(OWNER_AUTH_DATA_FILE);
  } catch {
    await fs.writeFile(
      OWNER_AUTH_DATA_FILE,
      JSON.stringify(getEmptyRegistryFile(), null, 2),
      "utf8",
    );
  }
}

async function readRegistryFile() {
  await ensureOwnerRegistryFile();

  try {
    const rawData = await fs.readFile(OWNER_AUTH_DATA_FILE, "utf8");

    return normalizeRegistryFile(JSON.parse(rawData));
  } catch {
    const emptyState = getEmptyRegistryFile();
    await fs.writeFile(
      OWNER_AUTH_DATA_FILE,
      JSON.stringify(emptyState, null, 2),
      "utf8",
    );

    return emptyState;
  }
}

async function writeRegistryFile(input: OwnerRegistryFile) {
  const normalized = normalizeRegistryFile(input);

  await ensureOwnerRegistryFile();
  await fs.writeFile(OWNER_AUTH_DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");

  return normalized;
}

async function withRegistryLock<T>(handler: () => Promise<T>) {
  await fs.mkdir(OWNER_AUTH_DATA_DIR, {
    recursive: true,
  });

  let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;

  try {
    lockHandle = await fs.open(OWNER_AUTH_LOCK_FILE, "wx");
  } catch {
    throw new Error(
      "Configuration owner deja en cours. Reessaie dans quelques secondes.",
    );
  }

  try {
    return await handler();
  } finally {
    try {
      await lockHandle.close();
    } catch {
      // Ignore lock close failure.
    }

    await fs.unlink(OWNER_AUTH_LOCK_FILE).catch(() => undefined);
  }
}

async function readFirestoreRegistryFile(db: FirestoreLikeDb) {
  const snapshot = await db
    .collection(OWNER_SECURITY_COLLECTION)
    .doc(OWNER_SECURITY_DOCUMENT_ID)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return normalizeRegistryFile(snapshot.data() || {});
}

async function writeFirestoreRegistryFile(db: FirestoreLikeDb, input: OwnerRegistryFile) {
  const normalized = normalizeRegistryFile(input);

  await db
    .collection(OWNER_SECURITY_COLLECTION)
    .doc(OWNER_SECURITY_DOCUMENT_ID)
    .set(normalized, {
      merge: true,
    });

  return normalized;
}

async function getRegistrySource() {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return {
      source: "file" as const,
      registry: await readRegistryFile(),
      firestoreDb: null,
    };
  }

  const firestoreRegistry = await readFirestoreRegistryFile(firestoreDb);

  if (firestoreRegistry?.initialized) {
    return {
      source: "firestore" as const,
      registry: firestoreRegistry,
      firestoreDb,
    };
  }

  const localRegistry = await readRegistryFile();

  if (localRegistry.initialized) {
    await writeFirestoreRegistryFile(firestoreDb, {
      ...localRegistry,
      updatedAt: getNowIso(),
      setupCompletedAt: localRegistry.setupCompletedAt || localRegistry.createdAt,
    });

    const migratedRegistry =
      (await readFirestoreRegistryFile(firestoreDb)) || localRegistry;

    return {
      source: "firestore" as const,
      registry: migratedRegistry,
      firestoreDb,
    };
  }

  return {
    source: "firestore" as const,
    registry: firestoreRegistry || getEmptyRegistryFile(),
    firestoreDb,
  };
}

export async function getOwnerAuthState() {
  const source = await getRegistrySource();

  return toOwnerAuthState(source.registry);
}

export async function initializeOwnerAccount(identity: OwnerIdentityInput) {
  return withRegistryLock(async () => {
    const normalizedUid = identity.uid.trim();
    const normalizedEmail = identity.email.trim().toLowerCase();

    if (!normalizedUid || !normalizedEmail) {
      throw new Error("Identite Firebase invalide.");
    }

    const source = await getRegistrySource();

    if (source.registry.initialized) {
      throw new Error("Le compte proprietaire est deja configure.");
    }

    const now = getNowIso();
    const nextRegistry: OwnerRegistryFile = {
      ...source.registry,
      initialized: true,
      ownerUid: normalizedUid,
      ownerEmail: normalizedEmail,
      createdAt: now,
      setupCompletedAt: now,
      updatedAt: now,
    };

    if (source.firestoreDb) {
      const writtenRegistry = await writeFirestoreRegistryFile(source.firestoreDb, nextRegistry);

      return toOwnerAuthState(writtenRegistry);
    }

    const writtenRegistry = await writeRegistryFile(nextRegistry);

    return toOwnerAuthState(writtenRegistry);
  });
}

export async function isOwnerIdentityAuthorized(
  identity: OwnerIdentityInput,
): Promise<boolean> {
  const normalizedUid = identity.uid.trim();
  const normalizedEmail = identity.email.trim().toLowerCase();

  if (!normalizedUid || !normalizedEmail) {
    return false;
  }

  const source = await getRegistrySource();
  const registryFile = source.registry;

  if (!registryFile.initialized) {
    return false;
  }

  return (
    registryFile.ownerUid === normalizedUid &&
    registryFile.ownerEmail === normalizedEmail
  );
}
