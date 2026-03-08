import type { App } from "./app";

export type Auth = {
  app?: App;
  isStub: true;
  kind: "admin-auth";
  verifyIdToken: (
    token: string,
    checkRevoked?: boolean,
  ) => Promise<{
    uid: string;
    email?: string;
  }>;
};

function buildSdkMissingError() {
  return new Error(
    "Firebase Admin SDK indisponible. Installe `firebase-admin` et configure le service account.",
  );
}

export function getAuth(app?: App): Auth {
  return {
    app,
    isStub: true,
    kind: "admin-auth",
    async verifyIdToken(token: string, checkRevoked?: boolean) {
      void token;
      void checkRevoked;
      throw buildSdkMissingError();
    },
  };
}
