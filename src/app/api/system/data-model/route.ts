import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import {
  getFirestoreDataModelSummary,
  getPolicySummary,
} from "@/lib/firestore";

export async function GET() {
  const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();
  const allowPublicSystemEndpoints = process.env.PUBLIC_SYSTEM_ENDPOINTS === "true";

  if (!ownerIdentity && !allowPublicSystemEndpoints) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  return NextResponse.json({
    app: "vichly-messenger",
    generatedAt: new Date().toISOString(),
    dataModel: getFirestoreDataModelSummary(),
    policy: getPolicySummary(),
  });
}
