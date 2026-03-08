import type { DraftEntryRecord } from "@/lib/drafts";
import { NextResponse } from "next/server";

import { createOwnerDraft, listOwnerDrafts } from "@/lib/drafts";

export const runtime = "nodejs";

type CreateDraftPayload = {
  title?: string;
  content?: string;
  tags?: string[];
  isPinned?: boolean;
  entries?: DraftEntryRecord[];
  aiAssistantEnabled?: boolean;
};

export async function GET() {
  const result = await listOwnerDrafts();

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  let payload: CreateDraftPayload = {};

  try {
    payload = (await request.json()) as CreateDraftPayload;
  } catch {
    payload = {};
  }

  const result = await createOwnerDraft({
    title: payload.title,
    content: payload.content,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isPinned: Boolean(payload.isPinned),
    entries: Array.isArray(payload.entries) ? payload.entries : undefined,
    aiAssistantEnabled: Boolean(payload.aiAssistantEnabled),
  });

  return NextResponse.json(result, {
    status: 201,
  });
}
