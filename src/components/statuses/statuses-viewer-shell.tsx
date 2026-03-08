"use client";

import dynamic from "next/dynamic";

import ModuleLoadingShell from "@/components/ui/module-loading-shell";

const StatusesViewer = dynamic(
  () => import("@/components/statuses/statuses-viewer"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoadingShell label="Chargement des stories..." />
    ),
  },
);

export default function StatusesViewerShell() {
  return <StatusesViewer />;
}
