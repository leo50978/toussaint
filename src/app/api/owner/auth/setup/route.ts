import { NextRequest, NextResponse } from "next/server";

import { verifyFirebaseOwnerIdToken } from "@/lib/auth/firebase-owner-auth";
import { getOwnerAuthState, initializeOwnerAccount } from "@/lib/auth/owner-registry";

type SetupPayload = {
  idToken?: string;
};

function parseAllowedSetupEmails() {
  const rawValue = process.env.OWNER_SETUP_ALLOWED_EMAILS || "";

  return rawValue
    .split(/[,;\n]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hasValidSetupToken(request: NextRequest) {
  const expectedSetupToken = process.env.OWNER_SETUP_TOKEN?.trim() || "";

  if (!expectedSetupToken) {
    return false;
  }

  const receivedToken = request.headers.get("x-owner-setup-token")?.trim() || "";

  return Boolean(receivedToken) && receivedToken === expectedSetupToken;
}

export async function POST(request: NextRequest) {
  let payload: SetupPayload;

  try {
    payload = (await request.json()) as SetupPayload;
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

  const currentState = await getOwnerAuthState();

  if (currentState.initialized) {
    return NextResponse.json(
      {
        error: "Le compte proprietaire est deja configure.",
      },
      {
        status: 409,
      },
    );
  }

  try {
    const identity = await verifyFirebaseOwnerIdToken(idToken);

    if (!hasValidSetupToken(request)) {
      return NextResponse.json(
        {
          error:
            process.env.OWNER_SETUP_TOKEN?.trim()
              ? "Token setup invalide."
              : "Setup owner bloque. Configure OWNER_SETUP_TOKEN puis renvoie la requete avec le header x-owner-setup-token.",
        },
        {
          status: 403,
        },
      );
    }

    const allowedEmails = parseAllowedSetupEmails();

    if (allowedEmails.length && !allowedEmails.includes(identity.email)) {
      return NextResponse.json(
        {
          error: "Cet email n est pas autorise pour initialiser le compte owner.",
        },
        {
          status: 403,
        },
      );
    }

    const initializedState = await initializeOwnerAccount(identity);

    return NextResponse.json({
      ok: true,
      initialized: initializedState.initialized,
      ownerEmail: initializedState.ownerEmail,
      createdAt: initializedState.createdAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Configuration owner impossible.",
      },
      {
        status: 400,
      },
    );
  }
}
