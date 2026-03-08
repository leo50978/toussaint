"use client";

type ErrorScreenProps = {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export default function ErrorScreen({
  title,
  description,
  onRetry,
  retryLabel = "Reessayer",
}: ErrorScreenProps) {
  return (
    <main className="loading-shell">
      <section className="loading-card page-shell">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
          Incident detecte
        </p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-950">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-700">{description}</p>
        <div className="mt-6 grid gap-3">
          <div className="loading-bar w-full" />
          <div className="loading-bar w-4/5" />
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-8 inline-flex items-center justify-center rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white"
          >
            {retryLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}
