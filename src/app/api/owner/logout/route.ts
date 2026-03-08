import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { OWNER_SESSION_COOKIE } from "@/lib/auth/owner-session";

export async function POST() {
  const cookieStore = await cookies();

  cookieStore.delete(OWNER_SESSION_COOKIE);

  return NextResponse.json({
    ok: true,
  });
}
