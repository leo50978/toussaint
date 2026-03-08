import type { App } from "./app";

export function getFirestore(app?: App) {
  return {
    app,
    isStub: true,
    kind: "admin-firestore",
  };
}
