"use client";

import dynamic from "next/dynamic";

import ModuleLoadingShell from "@/components/ui/module-loading-shell";

const OwnerLoginForm = dynamic(
  () => import("@/components/owner/owner-login-form"),
  {
    ssr: false,
    loading: () => (
      <ModuleLoadingShell label="Chargement du formulaire..." />
    ),
  },
);

export default function OwnerLoginFormShell() {
  return <OwnerLoginForm />;
}
