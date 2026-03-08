import type { FirebaseApp } from "./app";

export function getFirestore(app?: FirebaseApp) {
  return {
    app,
    isStub: true,
    kind: "firestore",
  };
}
