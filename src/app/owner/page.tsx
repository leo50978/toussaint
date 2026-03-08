import { Suspense } from "react";

import OwnerDashboardShell from "@/components/owner/owner-dashboard-shell";
import OwnerLoginFormShell from "@/components/owner/owner-login-form-shell";
import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";

export default async function OwnerPage() {
  const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();

  if (!ownerIdentity) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 md:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.16),transparent_45%),linear-gradient(160deg,#0b141a_0%,#111b21_50%,#0b141a_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-black/35 backdrop-blur-[2px]" />

        <section className="relative z-10 w-full max-w-lg rounded-[1.8rem] border border-white/10 bg-[#111b21]/95 p-6 text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/90">
            Owner Secure Access
          </p>
          <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-50 md:text-3xl">
            Portail admin protege
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Premiere visite: creation du compte owner. Ensuite: connexion
            obligatoire pour acceder aux dashboards admin.
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  Chargement du formulaire...
                </div>
              }
            >
              <OwnerLoginFormShell />
            </Suspense>
          </div>
        </section>
      </main>
    );
  }

  return <OwnerDashboardShell />;
}
