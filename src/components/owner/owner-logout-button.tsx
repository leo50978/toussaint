"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { removeBrowserCacheByPrefix } from "@/lib/utils/browser-cache";

export default function OwnerLogoutButton() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);
    setErrorMessage("");

    const response = await fetch("/api/owner/logout", {
      method: "POST",
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setErrorMessage("Deconnexion impossible.");
      return;
    }

    removeBrowserCacheByPrefix("vichly_owner_");

    startTransition(() => {
      router.replace("/owner/login");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isSubmitting || isPending}
        className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-[inset_1px_1px_0_rgba(255,255,255,0.05),12px_12px_30px_rgba(0,0,0,0.35)] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <LogOut className="size-4 text-emerald-200" />
        {isSubmitting || isPending ? "Sortie..." : "Se deconnecter"}
      </button>

      {errorMessage ? (
        <p className="text-sm text-rose-200">{errorMessage}</p>
      ) : null}
    </div>
  );
}
