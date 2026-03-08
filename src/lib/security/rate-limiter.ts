import "server-only";

import { createHash } from "crypto";

import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";

const SECURITY_BUCKET_COLLECTION = "securityBuckets";
const fallbackBuckets = new Map<string, { count: number; resetAtMs: number }>();

type SecurityRateLimitStatus = {
  limit: number;
  remaining: number;
  resetAt: string;
};

type SecurityRateLimitResult = {
  allowed: boolean;
  status: SecurityRateLimitStatus;
  backend: "firestore" | "memory";
};

type SecurityBucketDocument = {
  scope: string;
  fingerprintHash: string;
  windowMs: number;
  windowStartedAt: string;
  resetAt: string;
  expiresAt: string;
  limit: number;
  count: number;
  updatedAt: string;
};

type FirestoreDocSnapshot = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

type FirestoreDocRef = {
  get: () => Promise<FirestoreDocSnapshot>;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
};

type FirestoreTransactionLike = {
  get: (ref: FirestoreDocRef) => Promise<FirestoreDocSnapshot>;
  set: (ref: FirestoreDocRef, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
};

type FirestoreLikeDb = {
  collection: (path: string) => {
    doc: (id: string) => FirestoreDocRef;
  };
  runTransaction?: <T>(
    updateFunction: (transaction: FirestoreTransactionLike) => Promise<T>,
  ) => Promise<T>;
};

function getNowIso(nowMs: number) {
  return new Date(nowMs).toISOString();
}

function getSecuritySalt() {
  return (
    process.env.OWNER_AUTH_SECRET ||
    process.env.CLIENT_ACCESS_SALT ||
    process.env.FIREBASE_PROJECT_ID ||
    "dev-only-vichly-security-bucket-salt"
  );
}

export function hashSecurityValue(value: string) {
  return createHash("sha256")
    .update(`${getSecuritySalt()}:${value}`)
    .digest("hex");
}

export function buildRequestFingerprint(request: Request, extras: string[] = []) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || "local";
  const userAgent = request.headers.get("user-agent") || "unknown";

  return [ipAddress, userAgent.slice(0, 120), ...extras.map((value) => value.trim().slice(0, 160))]
    .filter(Boolean)
    .join("|");
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

function normalizeBucketDocument(input: unknown): SecurityBucketDocument | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<SecurityBucketDocument>;

  if (
    typeof candidate.scope !== "string" ||
    typeof candidate.fingerprintHash !== "string" ||
    typeof candidate.windowMs !== "number" ||
    typeof candidate.windowStartedAt !== "string" ||
    typeof candidate.resetAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    typeof candidate.limit !== "number" ||
    typeof candidate.count !== "number" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    scope: candidate.scope,
    fingerprintHash: candidate.fingerprintHash,
    windowMs: Math.max(1_000, Math.round(candidate.windowMs)),
    windowStartedAt: candidate.windowStartedAt,
    resetAt: candidate.resetAt,
    expiresAt: candidate.expiresAt,
    limit: Math.max(1, Math.round(candidate.limit)),
    count: Math.max(0, Math.round(candidate.count)),
    updatedAt: candidate.updatedAt,
  };
}

async function consumeFallbackBucket(input: {
  scope: string;
  fingerprint: string;
  limit: number;
  windowMs: number;
  nowMs: number;
}): Promise<SecurityRateLimitResult> {
  const windowStartedMs = Math.floor(input.nowMs / input.windowMs) * input.windowMs;
  const resetAtMs = windowStartedMs + input.windowMs;
  const bucketKey = hashSecurityValue(
    `${input.scope}:${hashSecurityValue(input.fingerprint)}:${windowStartedMs}`,
  );
  const currentBucket = fallbackBuckets.get(bucketKey);

  if (!currentBucket || currentBucket.resetAtMs <= input.nowMs) {
    fallbackBuckets.set(bucketKey, {
      count: 1,
      resetAtMs,
    });

    return {
      allowed: true,
      backend: "memory",
      status: {
        limit: input.limit,
        remaining: Math.max(input.limit - 1, 0),
        resetAt: getNowIso(resetAtMs),
      },
    };
  }

  if (currentBucket.count >= input.limit) {
    return {
      allowed: false,
      backend: "memory",
      status: {
        limit: input.limit,
        remaining: 0,
        resetAt: getNowIso(currentBucket.resetAtMs),
      },
    };
  }

  currentBucket.count += 1;
  fallbackBuckets.set(bucketKey, currentBucket);

  return {
    allowed: true,
    backend: "memory",
    status: {
      limit: input.limit,
      remaining: Math.max(input.limit - currentBucket.count, 0),
      resetAt: getNowIso(currentBucket.resetAtMs),
    },
  };
}

export function getSecurityRateLimitBackend() {
  return getFirestoreDb() ? "firestore" : "memory";
}

export async function consumeSecurityWindow(input: {
  scope: string;
  fingerprint: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const scope = input.scope.trim().slice(0, 120);
  const fingerprint = input.fingerprint.trim();
  const limit = Math.max(1, Math.round(input.limit));
  const windowMs = Math.max(1_000, Math.round(input.windowMs));

  if (!scope || !fingerprint) {
    return {
      allowed: false,
      backend: getSecurityRateLimitBackend(),
      status: {
        limit,
        remaining: 0,
        resetAt: getNowIso(nowMs),
      },
    } satisfies SecurityRateLimitResult;
  }

  const firestoreDb = getFirestoreDb();

  if (!firestoreDb) {
    return consumeFallbackBucket({
      scope,
      fingerprint,
      limit,
      windowMs,
      nowMs,
    });
  }

  const fingerprintHash = hashSecurityValue(fingerprint);
  const windowStartedMs = Math.floor(nowMs / windowMs) * windowMs;
  const resetAtMs = windowStartedMs + windowMs;
  const bucketId = hashSecurityValue(`${scope}:${fingerprintHash}:${windowStartedMs}`);
  const bucketRef = firestoreDb.collection(SECURITY_BUCKET_COLLECTION).doc(bucketId);
  const nextPayload = (nextCount: number): SecurityBucketDocument => ({
    scope,
    fingerprintHash,
    windowMs,
    windowStartedAt: getNowIso(windowStartedMs),
    resetAt: getNowIso(resetAtMs),
    expiresAt: getNowIso(resetAtMs + windowMs),
    limit,
    count: nextCount,
    updatedAt: getNowIso(nowMs),
  });

  if (typeof firestoreDb.runTransaction === "function") {
    return firestoreDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(bucketRef);
      const bucket = normalizeBucketDocument(snapshot.data?.() || {});
      const currentCount = bucket ? bucket.count : 0;

      if (currentCount >= limit) {
        return {
          allowed: false,
          backend: "firestore",
          status: {
            limit,
            remaining: 0,
            resetAt: getNowIso(resetAtMs),
          },
        } satisfies SecurityRateLimitResult;
      }

      const nextCount = currentCount + 1;
      transaction.set(bucketRef, nextPayload(nextCount), {
        merge: true,
      });

      return {
        allowed: true,
        backend: "firestore",
        status: {
          limit,
          remaining: Math.max(limit - nextCount, 0),
          resetAt: getNowIso(resetAtMs),
        },
      } satisfies SecurityRateLimitResult;
    });
  }

  const snapshot = await bucketRef.get();
  const bucket = normalizeBucketDocument(snapshot.data?.() || {});
  const currentCount = bucket ? bucket.count : 0;

  if (currentCount >= limit) {
    return {
      allowed: false,
      backend: "firestore",
      status: {
        limit,
        remaining: 0,
        resetAt: getNowIso(resetAtMs),
      },
    } satisfies SecurityRateLimitResult;
  }

  const nextCount = currentCount + 1;
  await bucketRef.set(nextPayload(nextCount), {
    merge: true,
  });

  return {
    allowed: true,
    backend: "firestore",
    status: {
      limit,
      remaining: Math.max(limit - nextCount, 0),
      resetAt: getNowIso(resetAtMs),
    },
  } satisfies SecurityRateLimitResult;
}
