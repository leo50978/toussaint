import { NextResponse } from "next/server";

import { listPublicStatuses } from "@/lib/statuses";

export const runtime = "nodejs";

export async function GET() {
  const result = await listPublicStatuses();

  return NextResponse.json(result);
}
