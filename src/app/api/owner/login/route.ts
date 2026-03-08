import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyFirebaseOwnerIdToken } from "@/lib/auth/firebase-owner-auth";
import { getOwnerAuthState, isOwnerIdentityAuthorized } from "@/lib/auth/owner-registry";
import {
  OWNER_SESSION_COOKIE,
  createOwnerSessionToken,
  getOwnerSessionCookieOptions,
} from "@/lib/auth/owner-session";

function requestUsesSecureTransport(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");

  return forwardedProto === "https" || new URL(request.url).protocol === "https:";
}

type LoginPayload = {
  idToken?: string;
};

export async function POST(request: Request) {
  let payload: LoginPayload;

  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json(
      {
        error: "Payload JSON invalide.",
      },
      {
        status: 400,
      },
    );
  }

  const idToken = payload.idToken?.trim() || "";

  if (!idToken) {
    return NextResponse.json(
      {
        error: "Token Firebase manquant.",
      },
      {
        status: 400,
      },
    );
  }

  const authState = await getOwnerAuthState();

  if (!authState.initialized) {
    return NextResponse.json(
      {
        error: "Compte proprietaire non configure. Cree d abord ton compte.",
      },
      {
        status: 403,
      },
    );
  }

  let identity: {
    uid: string;
    email: string;
  };

  try {
    identity = await verifyFirebaseOwnerIdToken(idToken);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Verification Firebase impossible.",
      },
      {
        status: 401,
      },
    );
  }

  const isAuthorized = await isOwnerIdentityAuthorized(identity);

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Ce compte Firebase n est pas autorise pour l espace owner.",
      },
      {
        status: 403,
      },
    );
  }

  const cookieStore = await cookies();
  let sessionToken = "";

  try {
    sessionToken = await createOwnerSessionToken(identity);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Session owner impossible a creer.",
      },
      {
        status: 503,
      },
    );
  }

  cookieStore.set(
    OWNER_SESSION_COOKIE,
    sessionToken,
    getOwnerSessionCookieOptions(requestUsesSecureTransport(request)),
  );

  return NextResponse.json({
    ok: true,
  });
}
