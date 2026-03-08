import type { App } from "./app";

export function getStorage(app?: App) {
  return {
    app,
    isStub: true,
    kind: "admin-storage",
  };
}
