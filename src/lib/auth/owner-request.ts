import "server-only";

import { cookies } from "next/headers";

import { OWNER_SESSION_COOKIE, decodeOwnerSessionToken } from "@/lib/auth/owner-session";
import { isOwnerIdentityAuthorized } from "@/lib/auth/owner-registry";

export type OwnerRequestIdentity = {
  uid: string;
  email: string;
};

export async function getAuthorizedOwnerIdentityFromRequest(): Promise<OwnerRequestIdentity | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
    const decodedSession = await decodeOwnerSessionToken(token);

    if (!decodedSession) {
      return null;
    }

    const authorized = await isOwnerIdentityAuthorized({
      uid: decodedSession.uid,
      email: decodedSession.email,
    });

    if (!authorized) {
      return null;
    }

    return {
      uid: decodedSession.uid,
      email: decodedSession.email,
    };
  } catch {
    return null;
  }
}

