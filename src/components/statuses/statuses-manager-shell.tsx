"use client";

import dynamic from "next/dynamic";

import ModuleLoadingShell from "@/components/ui/module-loading-shell";

const StatusesManager = dynamic(
  () => import("@/components/statuses/statuses-manager"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoadingShell label="Chargement des statuts..." />
    ),
  },
);

export default function StatusesManagerShell() {
  return <StatusesManager />;
}
