import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { listOwnerConversationSummaries } from "@/lib/chat/persistence";

const DEFAULT_OWNER_ID =
  process.env.OWNER_WORKSPACE_ID ||
  process.env.NEXT_PUBLIC_DEFAULT_OWNER_ID ||
  "vichly-owner";

export const runtime = "nodejs";

export async function GET() {
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
    const state = await listOwnerConversationSummaries(DEFAULT_OWNER_ID);

    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Lecture owner impossible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
