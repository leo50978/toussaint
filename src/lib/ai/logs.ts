import "server-only";

import { promises as fs } from "fs";
import { join } from "path";

import type { SuggestionUsageLogEntry } from "./types";

const AI_LOG_DIR = join(process.cwd(), "data");
const AI_LOG_FILE = join(AI_LOG_DIR, "ai-usage-log.jsonl");

export async function appendSuggestionUsageLog(entry: SuggestionUsageLogEntry) {
  await fs.mkdir(AI_LOG_DIR, {
    recursive: true,
  });

  await fs.appendFile(AI_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}
