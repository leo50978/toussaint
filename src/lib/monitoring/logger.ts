import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import { createId } from "@/lib/utils/create-id";

type MonitoringLevel = "info" | "warn" | "error";

export type MonitoringEvent = {
  id: string;
  timestamp: string;
  level: MonitoringLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
};

const MONITORING_DATA_DIR = join(process.cwd(), "data");
const MONITORING_LOG_FILE = join(MONITORING_DATA_DIR, "monitoring-events.jsonl");
const MAX_SUMMARY_LINES = 200;

function getNowIso() {
  return new Date().toISOString();
}

async function ensureMonitoringLogFile() {
  await fs.mkdir(MONITORING_DATA_DIR, {
    recursive: true,
  });

  try {
    await fs.access(MONITORING_LOG_FILE);
  } catch {
    await fs.writeFile(MONITORING_LOG_FILE, "", "utf8");
  }
}

export async function recordMonitoringEvent(
  event: Omit<MonitoringEvent, "id" | "timestamp">,
) {
  const payload: MonitoringEvent = {
    id: createId(),
    timestamp: getNowIso(),
    level: event.level,
    source: event.source,
    message: event.message,
    context: event.context,
  };

  await ensureMonitoringLogFile();
  await fs.appendFile(MONITORING_LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function getMonitoringSummary() {
  await ensureMonitoringLogFile();

  try {
    const raw = await fs.readFile(MONITORING_LOG_FILE, "utf8");
    const lines = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-MAX_SUMMARY_LINES);
    const events = lines
      .map((line) => {
        try {
          return JSON.parse(line) as MonitoringEvent;
        } catch {
          return null;
        }
      })
      .filter((event): event is MonitoringEvent => Boolean(event));

    const byLevel = {
      info: events.filter((event) => event.level === "info").length,
      warn: events.filter((event) => event.level === "warn").length,
      error: events.filter((event) => event.level === "error").length,
    };

    return {
      file: MONITORING_LOG_FILE,
      sampledEvents: events.length,
      byLevel,
      latest: events.at(-1) || null,
    };
  } catch {
    return {
      file: MONITORING_LOG_FILE,
      sampledEvents: 0,
      byLevel: {
        info: 0,
        warn: 0,
        error: 0,
      },
      latest: null,
    };
  }
}
