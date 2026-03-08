import "server-only";

import { getFirebaseAdminServices, hasFirebaseAdminConfig } from "@/lib/firebase/admin";

export type VerifiedFirebaseIdentity = {
  uid: string;
  email: string;
};

export async function verifyFirebaseOwnerIdToken(
  idToken: string,
): Promise<VerifiedFirebaseIdentity> {
  const normalizedIdToken = idToken.trim();

  if (!normalizedIdToken) {
    throw new Error("Token Firebase manquant.");
  }

  if (!hasFirebaseAdminConfig()) {
    throw new Error(
      "Firebase Admin n est pas configure. Ajoute FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.",
    );
  }

  const firebaseAuth = getFirebaseAdminServices().auth as {
    verifyIdToken?: (
      token: string,
      checkRevoked?: boolean,
    ) => Promise<{
      uid?: unknown;
      email?: unknown;
    }>;
  };

  if (typeof firebaseAuth.verifyIdToken !== "function") {
    throw new Error("Firebase Auth Admin indisponible.");
  }

  const decodedToken = await firebaseAuth.verifyIdToken(normalizedIdToken, true);
  const uid = typeof decodedToken.uid === "string" ? decodedToken.uid.trim() : "";
  const email =
    typeof decodedToken.email === "string"
      ? decodedToken.email.trim().toLowerCase()
      : "";

  if (!uid || !email) {
    throw new Error("Le token Firebase ne contient pas d identite valide.");
  }

  return {
    uid,
    email,
  };
}
