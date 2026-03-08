const DEFAULT_OWNER_ID = "vichly-owner";

export function getChatRuntimeConfig() {
  return {
    ownerId: process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID || DEFAULT_OWNER_ID,
    runtimeMode: "local-browser-store" as const,
    usesFirestoreSnapshotShape: true,
  };
}

export function getChatRuntimeStatus() {
  return {
    mode: "local-browser-store" as const,
    persistent: true,
    realtime: true,
    storageKey: "vichly_local_chat_store",
    snapshotListenerStyle: true,
  };
}
