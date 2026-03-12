import Link from "next/link";
import { ArrowRight, LockKeyhole, Server, Sparkles } from "lucide-react";

import { getBootstrapChecklist } from "@/lib/config/bootstrap";

export default function LandingShell() {
  const checklist = getBootstrapChecklist();

  return (
    <main className="page-shell mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-5 py-8 md:px-10 md:py-12">
      <section className="stagger-grid grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="soft-card rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_24px_80px_rgba(30,27,22,0.08)] backdrop-blur md:p-10">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">
            <Sparkles className="size-4 text-[var(--primary)]" />
            Plateforme business intelligente
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 md:text-6xl">
            Vichly Messenger centralise messages, IA, status et brouillons.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-700 md:text-lg">
            Une interface PWA orientee business, avec messagerie instantanee,
            reponses assistees, status temporaires et espace prive pour tes
            contenus internes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/status"
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800"
            >
              Voir les status
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              Ouvrir le chat client
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/owner/login"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              Ouvrir le dashboard proprietaire
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="/api/system/bootstrap"
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800"
            >
              Inspecter le bootstrap JSON
              <Server className="size-4 text-[var(--accent)]" />
            </a>
            <a
              href="/api/system/data-model"
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800"
            >
              Inspecter le data model JSON
              <Server className="size-4 text-[var(--accent)]" />
            </a>
          </div>
        </div>

        <aside className="soft-card rounded-[2rem] border border-[var(--border)] bg-[var(--surface-solid)] p-7 shadow-[0_24px_80px_rgba(30,27,22,0.06)] md:p-8">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LockKeyhole className="size-4 text-[var(--accent)]" />
            Checklist runtime
          </p>
          <div className="mt-5 space-y-3">
            {checklist.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border)] bg-white/80 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      item.ready
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {item.ready ? "pret" : "a finir"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
