import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { deleteConversation, getOwnerConversationState } from "@/lib/chat/persistence";

const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();

  if (!ownerIdentity) {
    return NextResponse.json(
      {
        error: "Session owner requise.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const { conversationId } = await context.params;
    const conversation = await getOwnerConversationState(DEFAULT_OWNER_ID, conversationId);

    if (!conversation) {
      return NextResponse.json(
        {
          error: "Discussion introuvable.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      conversation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lecture de discussion impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();

  if (!ownerIdentity) {
    return NextResponse.json(
      {
        error: "Session owner requise.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const { conversationId } = await context.params;
    const deleted = await deleteConversation(DEFAULT_OWNER_ID, conversationId);

    if (!deleted) {
      return NextResponse.json(
        {
          error: "Discussion introuvable.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Suppression de discussion impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
