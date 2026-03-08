import type { FirebaseApp } from "./app";

export function getStorage(app?: FirebaseApp) {
  return {
    app,
    isStub: true,
    kind: "storage",
  };
}
