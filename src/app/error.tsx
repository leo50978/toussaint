"use client";

import { useEffect, useRef } from "react";

import ErrorScreen from "@/components/system/error-screen";

type ErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function AppError({ error, reset }: ErrorPageProps) {
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
        scope: "segment",
        message: error.message,
        digest: error.digest,
        path: window.location.pathname,
      }),
    }).catch(() => {});
  }, [error.digest, error.message]);

  return (
    <ErrorScreen
      title="Une erreur est survenue dans cette page."
      description="Le systeme a enregistre l incident. Tu peux relancer le rendu sans perdre la session."
      onRetry={reset}
    />
  );
}
