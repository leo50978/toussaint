import type { FirebaseApp } from "./app";

type StubUser = {
  uid: string;
  email: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

export type Auth = {
  app?: FirebaseApp;
  isStub: true;
  kind: "auth";
  currentUser: StubUser | null;
};

function buildSdkMissingError() {
  return new Error(
    "Firebase Auth SDK indisponible. Installe la dependance `firebase` avant d utiliser l authentification owner.",
  );
}

export function getAuth(app?: FirebaseApp): Auth {
  return {
    app,
    isStub: true,
    kind: "auth",
    currentUser: null,
  };
}

export async function createUserWithEmailAndPassword(
  auth: Auth,
  email: string,
  password: string,
) {
  void auth;
  void email;
  void password;
  throw buildSdkMissingError();
}

export async function signInWithEmailAndPassword(
  auth: Auth,
  email: string,
  password: string,
) {
  void auth;
  void email;
  void password;
  throw buildSdkMissingError();
}

export async function signOut(auth: Auth) {
  void auth;
  return;
}
