import { NextResponse } from "next/server";

import { deleteOwnerStatus } from "@/lib/statuses";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    statusId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { statusId } = await context.params;
  const deleted = await deleteOwnerStatus(statusId);

  if (!deleted) {
    return NextResponse.json(
      {
        error: "Statut introuvable.",
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
