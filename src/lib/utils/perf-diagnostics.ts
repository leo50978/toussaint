"use client";

type PerfMetricPrimitive = string | number | boolean | null;

type PerfMetricDetails = Record<string, PerfMetricPrimitive>;

type PerfMetricEvent = {
  name: string;
  at: number;
  durationMs?: number;
  details?: PerfMetricDetails;
};

type PerfMetricSummary = {
  count: number;
  lastAt: number;
  lastDurationMs?: number;
  totalDurationMs?: number;
  avgDurationMs?: number;
  maxDurationMs?: number;
};

type PerfDiagnosticsState = {
  events: PerfMetricEvent[];
  summary: Record<string, PerfMetricSummary>;
};

declare global {
  interface Window {
    __VICHLY_PERF__?: {
      read: () => PerfDiagnosticsState;
      clear: () => void;
    };
  }
}

const MAX_PERF_EVENTS = 160;

const diagnosticsState: PerfDiagnosticsState = {
  events: [],
  summary: {},
};

function canUseWindow() {
  return typeof window !== "undefined";
}

function cloneDiagnosticsState(): PerfDiagnosticsState {
  return {
    events: diagnosticsState.events.map((event) => ({
      ...event,
      details: event.details ? { ...event.details } : undefined,
    })),
    summary: Object.fromEntries(
      Object.entries(diagnosticsState.summary).map(([key, value]) => [key, { ...value }]),
    ),
  };
}

function ensureDiagnosticsExposed() {
  if (!canUseWindow()) {
    return;
  }

  if (window.__VICHLY_PERF__) {
    return;
  }

  window.__VICHLY_PERF__ = {
    read: () => cloneDiagnosticsState(),
    clear: () => {
      diagnosticsState.events = [];
      diagnosticsState.summary = {};
    },
  };
}

function sanitizeDetails(details?: PerfMetricDetails) {
  if (!details) {
    return undefined;
  }

  const nextDetails = Object.entries(details).reduce<PerfMetricDetails>(
    (result, [key, value]) => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        result[key] = value;
      }

      return result;
    },
    {},
  );

  return Object.keys(nextDetails).length ? nextDetails : undefined;
}

function appendPerfEvent(event: PerfMetricEvent) {
  diagnosticsState.events.push(event);

  if (diagnosticsState.events.length > MAX_PERF_EVENTS) {
    diagnosticsState.events.splice(0, diagnosticsState.events.length - MAX_PERF_EVENTS);
  }

  const currentSummary = diagnosticsState.summary[event.name] || {
    count: 0,
    lastAt: event.at,
  };
  const nextSummary: PerfMetricSummary = {
    ...currentSummary,
    count: currentSummary.count + 1,
    lastAt: event.at,
  };

  if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
    const previousTotal = currentSummary.totalDurationMs || 0;
    const nextTotal = previousTotal + event.durationMs;
    nextSummary.lastDurationMs = event.durationMs;
    nextSummary.totalDurationMs = nextTotal;
    nextSummary.avgDurationMs = nextTotal / nextSummary.count;
    nextSummary.maxDurationMs = Math.max(currentSummary.maxDurationMs || 0, event.durationMs);
  }

  diagnosticsState.summary[event.name] = nextSummary;
}

export function recordPerfMetric(
  name: string,
  details?: PerfMetricDetails,
  durationMs?: number,
) {
  if (!canUseWindow()) {
    return;
  }

  ensureDiagnosticsExposed();

  appendPerfEvent({
    name,
    at: Date.now(),
    durationMs:
      typeof durationMs === "number" && Number.isFinite(durationMs)
        ? Math.max(0, Math.round(durationMs))
        : undefined,
    details: sanitizeDetails(details),
  });
}

export async function measurePerfMetric<T>(
  name: string,
  details: PerfMetricDetails | undefined,
  task: () => Promise<T>,
) {
  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  try {
    const result = await task();
    const endedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    recordPerfMetric(name, details, endedAt - startedAt);
    return result;
  } catch (error) {
    const endedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    recordPerfMetric(
      `${name}:error`,
      details,
      endedAt - startedAt,
    );
    throw error;
  }
}
