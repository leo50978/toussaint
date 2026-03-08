import { NextResponse } from "next/server";

import { getPublicOwnerProfile } from "@/lib/owner-profile";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getPublicOwnerProfile();

  return NextResponse.json(profile);
}
