import { NextResponse } from "next/server";

import { getOwnerProfile, updateOwnerProfile } from "@/lib/owner-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OwnerProfilePayload = {
  displayName?: string;
  jobTitle?: string;
  avatarUrl?: string;
  aiBusinessContext?: string;
  aiAttentionKeywords?: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  const profile = await getOwnerProfile();

  return NextResponse.json(profile, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function PUT(request: Request) {
  let payload: OwnerProfilePayload = {};

  try {
    const rawPayload = await request.json();

    if (isObject(rawPayload)) {
      payload = rawPayload;
    }
  } catch {
    payload = {};
  }

  const profile = await updateOwnerProfile({
    displayName:
      typeof payload.displayName === "string" ? payload.displayName : undefined,
    jobTitle: typeof payload.jobTitle === "string" ? payload.jobTitle : undefined,
    avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined,
    aiBusinessContext:
      typeof payload.aiBusinessContext === "string"
        ? payload.aiBusinessContext
        : undefined,
    aiAttentionKeywords: Array.isArray(payload.aiAttentionKeywords)
      ? payload.aiAttentionKeywords.filter(
          (keyword): keyword is string => typeof keyword === "string",
        )
      : undefined,
  });

  return NextResponse.json(profile, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
