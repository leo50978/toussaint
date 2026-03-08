"use client";

import dynamic from "next/dynamic";

import ModuleLoadingShell from "@/components/ui/module-loading-shell";

const OwnerMessagingDashboard = dynamic(
  () => import("@/components/owner/owner-messaging-dashboard"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoadingShell label="Chargement du dashboard owner..." />
    ),
  },
);

export default function OwnerDashboardShell() {
  return <OwnerMessagingDashboard />;
}
