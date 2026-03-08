import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { deleteConversationMessage } from "@/lib/chat/persistence";

const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    conversationId: string;
    messageId: string;
  }>;
};

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
    const { conversationId, messageId } = await context.params;
    const conversation = await deleteConversationMessage(
      DEFAULT_OWNER_ID,
      conversationId,
      messageId,
    );

    if (!conversation) {
      return NextResponse.json(
        {
          error: "Message introuvable.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      conversation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Suppression du message impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
