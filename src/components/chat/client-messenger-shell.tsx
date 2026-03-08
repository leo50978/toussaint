"use client";

import dynamic from "next/dynamic";

import ModuleLoadingShell from "@/components/ui/module-loading-shell";

const ClientMessenger = dynamic(
  () => import("@/components/chat/client-messenger"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoadingShell label="Chargement de la messagerie..." />
    ),
  },
);

export default function ClientMessengerShell() {
  return <ClientMessenger />;
}
