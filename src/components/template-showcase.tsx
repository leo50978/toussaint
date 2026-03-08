"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  ArrowRight,
  Boxes,
  Database,
  Rocket,
  Sparkles,
  Timer,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const features: Feature[] = [
  {
    title: "Tailwind CSS",
    description: "Design system rapide a personnaliser pour tous tes projets.",
    icon: Sparkles,
  },
  {
    title: "GSAP Ready",
    description: "Animations fluides prete a brancher sur n importe quel composant.",
    icon: Rocket,
  },
  {
    title: "Lucide Icons",
    description: "Bibliotheque d icones moderne et legere integree nativement.",
    icon: Boxes,
  },
  {
    title: "Firebase Ready",
    description:
      "SDK web et admin preconfigures via variables d environnement.",
    icon: Database,
  },
];

const starterSteps = [
  "npm install",
  "npm run dev",
  "editer src/app/page.tsx",
];

export default function TemplateShowcase() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from("[data-hero-item]", {
        y: 24,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
      });

      gsap.from("[data-feature-card]", {
        y: 18,
        opacity: 0,
        duration: 0.7,
        delay: 0.2,
        stagger: 0.1,
        ease: "power2.out",
      });
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-5 py-8 md:px-10 md:py-12"
    >
      <header
        data-hero-item
        className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-xs font-medium tracking-wide text-slate-700 shadow-sm backdrop-blur"
      >
        <WandSparkles className="size-4 text-primary" />
        Next.js Template reutilisable
      </header>

      <main className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section
          data-hero-item
          className="rounded-3xl border border-white/80 bg-surface p-7 shadow-lg shadow-slate-200/70 backdrop-blur md:p-10"
        >
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-primary">
            Base de depart
          </p>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight text-slate-900 md:text-5xl">
            Tailwind + next/font + GSAP + Lucide + Firebase, deja prets.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
            Utilise ce projet comme template local, duplique le dossier sans
            `.git`, puis lance un nouveau depot propre pour chaque nouveau site.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-white">
            Commencer un nouveau projet
            <ArrowRight className="size-4" />
          </div>
        </section>

        <aside
          data-hero-item
          className="rounded-3xl border border-white/80 bg-surface-solid p-7 shadow-lg shadow-slate-200/60 md:p-8"
        >
          <p className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <Timer className="size-4 text-accent" />
            Demarrage rapide
          </p>
          <ol className="space-y-4">
            {starterSteps.map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <code className="font-mono text-sm text-slate-800">{step}</code>
              </li>
            ))}
          </ol>
        </aside>
      </main>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {features.map(({ title, description, icon: Icon }) => (
          <article
            key={title}
            data-feature-card
            className="rounded-2xl border border-white/70 bg-white/85 p-6 shadow-md shadow-slate-200/60"
          >
            <Icon className="size-5 text-primary" />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {description}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
