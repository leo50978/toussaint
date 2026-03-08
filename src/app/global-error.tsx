"use client";

import { useEffect, useRef } from "react";

import ErrorScreen from "@/components/system/error-screen";

type GlobalErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorPageProps) {
  const hasReportedRef = useRef(false);

  useEffect(() => {
    if (hasReportedRef.current) {
      return;
    }

    hasReportedRef.current = true;

    void fetch("/api/system/client-error", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "global",
        message: error.message,
        digest: error.digest,
        path: window.location.pathname,
      }),
    }).catch(() => {});
  }, [error.digest, error.message]);

  return (
    <html lang="fr">
      <body>
        <ErrorScreen
          title="Le shell principal a rencontre une erreur."
          description="L incident a ete journalise. Tu peux tenter un rechargement propre depuis ce point."
          onRetry={reset}
          retryLabel="Recharger l application"
        />
      </body>
    </html>
  );
}
