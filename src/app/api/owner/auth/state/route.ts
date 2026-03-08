import { NextResponse } from "next/server";

import { getAuthorizedOwnerIdentityFromRequest } from "@/lib/auth/owner-request";
import { getOwnerAuthConfig } from "@/lib/auth/owner-session";
import { getOwnerAuthState } from "@/lib/auth/owner-registry";
import { hasFirebaseAdminConfig } from "@/lib/firebase/admin";

export async function GET() {
  const state = await getOwnerAuthState();
  const ownerIdentity = await getAuthorizedOwnerIdentityFromRequest();
  const ownerAuthConfig = getOwnerAuthConfig();

  return NextResponse.json({
    initialized: state.initialized,
    requiresSetup: !state.initialized,
    ownerEmail: ownerIdentity ? state.ownerEmail : null,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    adminConfigured: hasFirebaseAdminConfig(),
    setupTokenConfigured: ownerAuthConfig.setupTokenConfigured,
  });
}
