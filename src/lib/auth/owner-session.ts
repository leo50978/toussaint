const DEFAULT_OWNER_SECRET = "dev-only-vichly-owner-secret";
const MIN_OWNER_SECRET_LENGTH = 32;

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const OWNER_SESSION_COOKIE = "vichly_owner_session";

type OwnerSessionPayload = {
  uid: string;
  email: string;
  expiresAt: number;
};

type OwnerSessionSecretMatch = {
  secret: string;
  source: "current" | "previous" | "legacy-default";
};

export type OwnerSessionIdentity = {
  uid: string;
  email: string;
};

export type OwnerSessionInspection = {
  payload: OwnerSessionPayload | null;
  isValid: boolean;
  needsRotation: boolean;
  matchedSecretSource: OwnerSessionSecretMatch["source"] | null;
};

function encodeBytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeBase64Url(value: string): string {
  return encodeBytesToBase64Url(new TextEncoder().encode(value));
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return encodeBytesToBase64Url(new Uint8Array(signature));
}

function secureStringEquals(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

export function getOwnerAuthConfig() {
  const secret = process.env.OWNER_AUTH_SECRET?.trim() || "";
  const previousSecret = process.env.OWNER_AUTH_SECRET_PREVIOUS?.trim() || "";
  const setupToken = process.env.OWNER_SETUP_TOKEN?.trim() || "";
  const usingDefaultSecret = !secret || secret === DEFAULT_OWNER_SECRET;
  const isWeakSecret = !secret || secret.length < MIN_OWNER_SECRET_LENGTH;
  const acceptingLegacyDefault =
    Boolean(secret) &&
    secret !== DEFAULT_OWNER_SECRET &&
    previousSecret === DEFAULT_OWNER_SECRET;

  return {
    secret,
    previousSecret,
    usingDefaultSecret,
    isWeakSecret,
    acceptingLegacyDefault,
    setupTokenConfigured: Boolean(setupToken),
  };
}

function assertSecretReadyForRuntime() {
  const { isWeakSecret } = getOwnerAuthConfig();

  if (isWeakSecret) {
    throw new Error(
      "OWNER_AUTH_SECRET doit etre configure avec au moins 32 caracteres.",
    );
  }
}

function getAcceptedSecrets(): OwnerSessionSecretMatch[] {
  const { secret, previousSecret, acceptingLegacyDefault } = getOwnerAuthConfig();
  const candidates: OwnerSessionSecretMatch[] = [];
  const pushCandidate = (
    candidateSecret: string,
    source: OwnerSessionSecretMatch["source"],
  ) => {
    const normalizedSecret = candidateSecret.trim();

    if (!normalizedSecret) {
      return;
    }

    if (candidates.some((candidate) => candidate.secret === normalizedSecret)) {
      return;
    }

    candidates.push({
      secret: normalizedSecret,
      source,
    });
  };

  pushCandidate(secret, "current");
  pushCandidate(previousSecret, "previous");

  if (acceptingLegacyDefault) {
    pushCandidate(DEFAULT_OWNER_SECRET, "legacy-default");
  }

  return candidates;
}

export async function createOwnerSessionToken(
  identity: OwnerSessionIdentity,
): Promise<string> {
  assertSecretReadyForRuntime();
  const { secret } = getOwnerAuthConfig();
  const payload: OwnerSessionPayload = {
    uid: identity.uid.trim(),
    email: identity.email.trim().toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function inspectOwnerSessionToken(
  token: string | undefined | null,
): Promise<OwnerSessionInspection> {
  if (!token) {
    return {
      payload: null,
      isValid: false,
      needsRotation: false,
      matchedSecretSource: null,
    };
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return {
      payload: null,
      isValid: false,
      needsRotation: false,
      matchedSecretSource: null,
    };
  }

  let matchedSecretSource: OwnerSessionSecretMatch["source"] | null = null;

  for (const candidate of getAcceptedSecrets()) {
    const expectedSignature = await signValue(encodedPayload, candidate.secret);

    if (!secureStringEquals(signature, expectedSignature)) {
      continue;
    }

    matchedSecretSource = candidate.source;
    break;
  }

  if (!matchedSecretSource) {
    return {
      payload: null,
      isValid: false,
      needsRotation: false,
      matchedSecretSource: null,
    };
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<OwnerSessionPayload>;

    if (
      typeof payload.uid !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return {
        payload: null,
        isValid: false,
        needsRotation: false,
        matchedSecretSource,
      };
    }

    if (!payload.uid.trim() || !payload.email.trim()) {
      return {
        payload: null,
        isValid: false,
        needsRotation: false,
        matchedSecretSource,
      };
    }

    if (payload.expiresAt <= Date.now()) {
      return {
        payload: null,
        isValid: false,
        needsRotation: false,
        matchedSecretSource,
      };
    }

    return {
      payload: {
        uid: payload.uid.trim(),
        email: payload.email.trim().toLowerCase(),
        expiresAt: payload.expiresAt,
      },
      isValid: true,
      needsRotation: matchedSecretSource !== "current",
      matchedSecretSource,
    };
  } catch {
    return {
      payload: null,
      isValid: false,
      needsRotation: false,
      matchedSecretSource,
    };
  }
}

export async function decodeOwnerSessionToken(
  token: string | undefined | null,
): Promise<OwnerSessionPayload | null> {
  const inspection = await inspectOwnerSessionToken(token);

  return inspection.payload;
}

export async function verifyOwnerSessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  const decodedSession = await inspectOwnerSessionToken(token);

  return decodedSession.isValid;
}

export function getOwnerSessionCookieOptions(secure = false) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
