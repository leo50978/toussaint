import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join } from "path";

import { ChatStorageUnavailableError } from "@/lib/chat/errors";
import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";

type ClientAccessRecord = {
  id: string;
  ownerId: string;
  conversationId: string;
  clientName: string;
  clientKeyHash: string;
  securityCodeHash: string | null;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt: string | null;
};

type ClientAccessRegistryFile = {
  version: 1;
  updatedAt: string;
  sessions: ClientAccessRecord[];
};

type IssueClientAccessInput = {
  ownerId: string;
  conversationId: string;
  clientName: string;
  previousClientKey?: string;
};

type ValidateClientAccessInput = {
  ownerId: string;
  clientKey: string;
  conversationId?: string;
  securityCode?: string;
};

type SetClientAccessSecurityCodeInput = {
  ownerId: string;
  clientKey: string;
  securityCode: string;
};

const CLIENT_ACCESS_DATA_DIR = join(process.cwd(), "data");
const CLIENT_ACCESS_DATA_FILE = join(
  CLIENT_ACCESS_DATA_DIR,
  "client-access-registry.json",
);
const CLIENT_ACCESS_COLLECTION = "clientAccessSessions";
const DEFAULT_CLIENT_ACCESS_SALT = "dev-only-vichly-client-access-salt";
let legacyClientAccessMigrationTask: Promise<void> | null = null;

type FirestoreLikeDb = {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
    };
    where: (fieldPath: string, opStr: "==", value: string) => {
      get: () => Promise<{
        docs: Array<{
          id: string;
          data: () => Record<string, unknown> | undefined;
        }>;
      }>;
    };
    get: () => Promise<{
      docs: Array<{
        id: string;
        data: () => Record<string, unknown> | undefined;
      }>;
    }>;
  };
};

function getNowIso() {
  return new Date().toISOString();
}

function getClientAccessSalt() {
  return process.env.CLIENT_ACCESS_SALT?.trim() || "";
}

function getClientAccessPreviousSalt() {
  return process.env.CLIENT_ACCESS_SALT_PREVIOUS?.trim() || "";
}

function getClientAccessLegacySalt() {
  const currentSalt = getClientAccessSalt();
  const previousSalt = getClientAccessPreviousSalt();

  if (!currentSalt || currentSalt === DEFAULT_CLIENT_ACCESS_SALT) {
    return "";
  }

  return previousSalt === DEFAULT_CLIENT_ACCESS_SALT ? DEFAULT_CLIENT_ACCESS_SALT : "";
}

function hashWithSalt(salt: string, value: string) {
  return createHash("sha256")
    .update(`${salt}:${value.trim()}`)
    .digest("hex");
}

function getSaltCandidates() {
  const candidates = [getClientAccessSalt(), getClientAccessPreviousSalt(), getClientAccessLegacySalt()]
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}

function normalizeClientName(value: string) {
  return value.trim().slice(0, 80) || "Client";
}

function normalizeSecurityCode(value: string | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 32);
}

function normalizeClientKey(value: string | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 220);
}

function normalizeRegistryRecord(input: Partial<ClientAccessRecord>) {
  if (
    typeof input.id !== "string" ||
    typeof input.ownerId !== "string" ||
    typeof input.conversationId !== "string" ||
    typeof input.clientName !== "string" ||
    typeof input.clientKeyHash !== "string" ||
    typeof input.createdAt !== "string" ||
    typeof input.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: input.id,
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    clientName: input.clientName,
    clientKeyHash: input.clientKeyHash,
    securityCodeHash:
      typeof input.securityCodeHash === "string" && input.securityCodeHash
        ? input.securityCodeHash
        : null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastValidatedAt:
      typeof input.lastValidatedAt === "string" ? input.lastValidatedAt : null,
  } satisfies ClientAccessRecord;
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

async function readLegacyRegistryFileIfExists() {
  try {
    await fs.access(CLIENT_ACCESS_DATA_FILE);
  } catch {
    return null;
  }

  try {
    const raw = await fs.readFile(CLIENT_ACCESS_DATA_FILE, "utf8");
    return normalizeRegistryFile(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function migrateLegacyClientAccessToFirestore(db: FirestoreLikeDb) {
  const legacyRegistry = await readLegacyRegistryFileIfExists();

  if (!legacyRegistry?.sessions.length) {
    return;
  }

  await Promise.all(
    legacyRegistry.sessions.map((session) => writeClientAccessToFirestore(db, session)),
  );
}

async function requireClientAccessFirestoreDb() {
  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    throw new ChatStorageUnavailableError();
  }

  if (!legacyClientAccessMigrationTask) {
    legacyClientAccessMigrationTask = migrateLegacyClientAccessToFirestore(firestoreDb).catch(
      (error) => {
        legacyClientAccessMigrationTask = null;
        throw error;
      },
    );
  }

  await legacyClientAccessMigrationTask;

  return firestoreDb;
}

function buildClientAccessDocumentId(ownerId: string, conversationId: string) {
  return createHash("sha256")
    .update(`${ownerId.trim()}:${conversationId.trim()}`)
    .digest("hex");
}

function buildClientAccessFirestorePayload(record: ClientAccessRecord) {
  return {
    id: record.id,
    ownerId: record.ownerId,
    conversationId: record.conversationId,
    clientName: record.clientName,
    clientKeyHash: record.clientKeyHash,
    securityCodeHash: record.securityCodeHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastValidatedAt: record.lastValidatedAt,
  };
}

async function readClientAccessFromFirestoreByConversation(
  db: FirestoreLikeDb,
  ownerId: string,
  conversationId: string,
) {
  const snapshot = await db
    .collection(CLIENT_ACCESS_COLLECTION)
    .doc(buildClientAccessDocumentId(ownerId, conversationId))
    .get();

  if (!snapshot.exists) {
    return null;
  }

  return normalizeRegistryRecord(snapshot.data() || {});
}

async function readClientAccessFromFirestoreByClientKeyHash(
  db: FirestoreLikeDb,
  ownerId: string,
  clientKeyHash: string,
  conversationId?: string,
) {
  const querySnapshot = await db
    .collection(CLIENT_ACCESS_COLLECTION)
    .where("clientKeyHash", "==", clientKeyHash)
    .get();

  const matchedRecord = querySnapshot.docs
    .map((doc) => normalizeRegistryRecord(doc.data() || {}))
    .find((session) => {
      if (!session || session.ownerId !== ownerId) {
        return false;
      }

      if (conversationId && session.conversationId !== conversationId) {
        return false;
      }

      return true;
    });

  return matchedRecord || null;
}

async function writeClientAccessToFirestore(
  db: FirestoreLikeDb,
  record: ClientAccessRecord,
) {
  await db
    .collection(CLIENT_ACCESS_COLLECTION)
    .doc(buildClientAccessDocumentId(record.ownerId, record.conversationId))
    .set(buildClientAccessFirestorePayload(record), {
      merge: true,
    });

  return record;
}

function normalizeRegistryFile(input: unknown): ClientAccessRegistryFile {
  if (!input || typeof input !== "object") {
    return {
      version: 1,
      updatedAt: getNowIso(),
      sessions: [],
    };
  }

  const candidate = input as Partial<ClientAccessRegistryFile>;
  const sessions = Array.isArray(candidate.sessions)
    ? candidate.sessions
        .map((session) => normalizeRegistryRecord(session))
        .filter((session): session is ClientAccessRecord => Boolean(session))
    : [];

  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : getNowIso(),
    sessions,
  };
}

async function ensureClientAccessRegistryFile() {
  await fs.mkdir(CLIENT_ACCESS_DATA_DIR, {
    recursive: true,
  });

  try {
    await fs.access(CLIENT_ACCESS_DATA_FILE);
  } catch {
    const emptyRegistry: ClientAccessRegistryFile = {
      version: 1,
      updatedAt: getNowIso(),
      sessions: [],
    };

    await fs.writeFile(
      CLIENT_ACCESS_DATA_FILE,
      JSON.stringify(emptyRegistry, null, 2),
      "utf8",
    );
  }
}

async function writeRegistryFile(registry: ClientAccessRegistryFile) {
  const normalizedRegistry = normalizeRegistryFile(registry);

  await ensureClientAccessRegistryFile();
  await fs.writeFile(
    CLIENT_ACCESS_DATA_FILE,
    JSON.stringify(normalizedRegistry, null, 2),
    "utf8",
  );

  return normalizedRegistry;
}

export function hashClientAccessKey(clientKey: string) {
  const currentSalt = getClientAccessSalt();

  if (!currentSalt) {
    throw new Error("CLIENT_ACCESS_SALT doit etre configure.");
  }

  return hashWithSalt(currentSalt, clientKey);
}

export function hashClientSecurityCode(securityCode: string) {
  const currentSalt = getClientAccessSalt();

  if (!currentSalt) {
    throw new Error("CLIENT_ACCESS_SALT doit etre configure.");
  }

  return hashWithSalt(currentSalt, `security:${securityCode.trim()}`);
}

function getClientAccessKeyHashCandidates(clientKey: string) {
  return getSaltCandidates().map((salt, index) => ({
    hash: hashWithSalt(salt, clientKey),
    isCurrent: index === 0 && salt === getClientAccessSalt(),
  }));
}

function getClientSecurityCodeHashCandidates(securityCode: string) {
  return getSaltCandidates().map((salt, index) => ({
    hash: hashWithSalt(salt, `security:${securityCode.trim()}`),
    isCurrent: index === 0 && salt === getClientAccessSalt(),
  }));
}

export function generateClientAccessKey() {
  return `vch_${randomBytes(12).toString("base64url")}`;
}

export async function issueClientAccessSession(input: IssueClientAccessInput) {
  const ownerId = input.ownerId.trim();
  const conversationId = input.conversationId.trim();
  const clientName = normalizeClientName(input.clientName);
  const previousClientKey = normalizeClientKey(input.previousClientKey);

  if (!ownerId || !conversationId) {
    throw new Error("Session client invalide.");
  }

  const clientKey = generateClientAccessKey();
  const clientKeyHash = hashClientAccessKey(clientKey);
  const now = getNowIso();
  const firestoreDb = await requireClientAccessFirestoreDb();
  const existingRecord = await readClientAccessFromFirestoreByConversation(
    firestoreDb,
    ownerId,
    conversationId,
  );

  if (existingRecord) {
    if (!previousClientKey) {
      throw new Error(
        "Cette discussion existe deja. Utilise son ID actuel pour la restaurer.",
      );
    }

    const previousClientKeyMatches = getClientAccessKeyHashCandidates(previousClientKey).some(
      (candidate) => candidate.hash === existingRecord.clientKeyHash,
    );

    if (!previousClientKeyMatches) {
      throw new Error("ID de discussion invalide pour cette conversation.");
    }
  }

  const sessionId = existingRecord?.id || randomUUID();

  const nextRecord: ClientAccessRecord = {
    id: sessionId,
    ownerId,
    conversationId,
    clientName,
    clientKeyHash,
    securityCodeHash: existingRecord?.securityCodeHash || null,
    createdAt: existingRecord?.createdAt || now,
    updatedAt: now,
    lastValidatedAt: existingRecord?.lastValidatedAt || null,
  };

  await writeClientAccessToFirestore(firestoreDb, nextRecord);

  return {
    sessionId,
    ownerId,
    conversationId,
    clientName,
    clientKey,
    clientKeyHash,
    createdAt: nextRecord.createdAt,
    validatedAt: nextRecord.lastValidatedAt,
  };
}

export async function validateClientAccessSession(
  input: ValidateClientAccessInput,
) {
  const ownerId = input.ownerId.trim();
  const clientKey = input.clientKey.trim();
  const conversationId = input.conversationId?.trim();
  const securityCode = normalizeSecurityCode(input.securityCode);

  if (!ownerId || !clientKey) {
    return {
      valid: false as const,
      session: null,
    };
  }

  const clientKeyHashCandidates = getClientAccessKeyHashCandidates(clientKey);
  const firestoreDb = await requireClientAccessFirestoreDb();
  let matchedSession: ClientAccessRecord | null = null;
  let matchedHashIsCurrent = true;

  for (const candidate of clientKeyHashCandidates) {
    matchedSession = await readClientAccessFromFirestoreByClientKeyHash(
      firestoreDb,
      ownerId,
      candidate.hash,
      conversationId,
    );

    if (matchedSession) {
      matchedHashIsCurrent = candidate.isCurrent;
      break;
    }
  }

  if (!matchedSession) {
    return {
      valid: false as const,
      session: null,
    };
  }

  let securityCodeHashNeedsUpgrade = false;

  if (matchedSession.securityCodeHash) {
    const securityCodeCandidates = getClientSecurityCodeHashCandidates(securityCode);
    const matchingSecurityCodeCandidate = securityCodeCandidates.find(
      (candidate) => candidate.hash === matchedSession?.securityCodeHash,
    );

    if (!matchingSecurityCodeCandidate) {
      return {
        valid: false as const,
        session: null,
      };
    }

    securityCodeHashNeedsUpgrade = !matchingSecurityCodeCandidate.isCurrent;
  }

  const validatedAt = getNowIso();
  const nextSession: ClientAccessRecord = {
    ...matchedSession,
    clientKeyHash: matchedHashIsCurrent ? matchedSession.clientKeyHash : hashClientAccessKey(clientKey),
    updatedAt: validatedAt,
    lastValidatedAt: validatedAt,
    securityCodeHash:
      matchedSession.securityCodeHash && securityCodeHashNeedsUpgrade && securityCode
        ? hashClientSecurityCode(securityCode)
        : matchedSession.securityCodeHash,
  };

  await writeClientAccessToFirestore(firestoreDb, nextSession);

  return {
    valid: true as const,
    session: nextSession,
  };
}

export async function setClientAccessSecurityCode(
  input: SetClientAccessSecurityCodeInput,
) {
  const ownerId = input.ownerId.trim();
  const clientKey = input.clientKey.trim();

  if (!ownerId || !clientKey) {
    return {
      saved: false as const,
      hasSecurityCode: false,
    };
  }

  const clientKeyHashCandidates = getClientAccessKeyHashCandidates(clientKey);
  const securityCode = normalizeSecurityCode(input.securityCode);
  const firestoreDb = await requireClientAccessFirestoreDb();
  let matchedSession: ClientAccessRecord | null = null;

  for (const candidate of clientKeyHashCandidates) {
    matchedSession = await readClientAccessFromFirestoreByClientKeyHash(
      firestoreDb,
      ownerId,
      candidate.hash,
    );

    if (matchedSession) {
      break;
    }
  }

  if (!matchedSession) {
    return {
      saved: false as const,
      hasSecurityCode: false,
    };
  }

  const updatedAt = getNowIso();
  const nextSession: ClientAccessRecord = {
    ...matchedSession,
    updatedAt,
    clientKeyHash: hashClientAccessKey(clientKey),
    securityCodeHash: securityCode ? hashClientSecurityCode(securityCode) : null,
  };

  await writeClientAccessToFirestore(firestoreDb, nextSession);

  return {
    saved: true as const,
    hasSecurityCode: Boolean(nextSession.securityCodeHash),
  };
}

export async function getClientAccessRegistrySummary() {
  const firestoreDb = await requireClientAccessFirestoreDb();
  const querySnapshot = await firestoreDb.collection(CLIENT_ACCESS_COLLECTION).get();
  const sessions = querySnapshot.docs
    .map((doc) => normalizeRegistryRecord(doc.data() || {}))
    .filter((session): session is ClientAccessRecord => Boolean(session));

  return {
    sessions: sessions.length,
    latestValidation:
      sessions
        .map((session) => session.lastValidatedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) || null,
    updatedAt:
      sessions
        .map((session) => session.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || getNowIso(),
  };
}
