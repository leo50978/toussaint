import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { getBootstrapChecklist, getOpenAiRuntime } from "@/lib/config/bootstrap";
import { getFirebasePublicConfig } from "@/lib/firebase/config";

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

  const firebaseConfig = getFirebasePublicConfig();
  const openAiRuntime = getOpenAiRuntime();

  return NextResponse.json({
    app: "vichly-messenger",
    generatedAt: new Date().toISOString(),
    firebaseProjectId: firebaseConfig.projectId,
    openAiModel: openAiRuntime.model,
    checklist: getBootstrapChecklist(),
  });
}
