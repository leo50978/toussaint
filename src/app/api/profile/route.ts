import { NextResponse } from "next/server";

import { getPublicOwnerProfile } from "@/lib/owner-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const profile = await getPublicOwnerProfile();

  return NextResponse.json(profile, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
