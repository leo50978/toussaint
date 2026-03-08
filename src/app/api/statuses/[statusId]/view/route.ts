import { NextResponse } from "next/server";

import { incrementStatusView } from "@/lib/statuses";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    statusId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { statusId } = await context.params;
  const result = await incrementStatusView(statusId);

  if (!result) {
    return NextResponse.json(
      {
        error: "Statut introuvable ou expire.",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json(result);
}
