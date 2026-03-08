import type { DraftEntryRecord } from "@/lib/drafts";
import { NextResponse } from "next/server";

import { deleteOwnerDraft, updateOwnerDraft } from "@/lib/drafts";

export const runtime = "nodejs";

type UpdateDraftPayload = {
  title?: string;
  content?: string;
  tags?: string[];
  isPinned?: boolean;
  entries?: DraftEntryRecord[];
  aiAssistantEnabled?: boolean;
};

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { draftId } = await context.params;
  let payload: UpdateDraftPayload;

  try {
    payload = (await request.json()) as UpdateDraftPayload;
  } catch {
    return NextResponse.json(
      {
        error: "Payload JSON invalide.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await updateOwnerDraft(draftId, {
    title: payload.title || "",
    content: payload.content || "",
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    isPinned: Boolean(payload.isPinned),
    entries: Array.isArray(payload.entries) ? payload.entries : undefined,
    aiAssistantEnabled: Boolean(payload.aiAssistantEnabled),
  });

  if (!result) {
    return NextResponse.json(
      {
        error: "Brouillon introuvable.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json(result);
}

export async function DELETE(_: Request, context: RouteContext) {
  const { draftId } = await context.params;
  const deleted = await deleteOwnerDraft(draftId);

  if (!deleted) {
    return NextResponse.json(
      {
        error: "Brouillon introuvable.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}
