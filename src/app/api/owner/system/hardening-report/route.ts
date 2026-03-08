import { NextResponse } from "next/server";

import { getSuggestionRateLimitConfig } from "@/lib/ai/rate-limit";
import { getClientAccessRegistrySummary } from "@/lib/chat/client-access";
import { isChatStorageUnavailableError } from "@/lib/chat/errors";
import { getMonitoringSummary } from "@/lib/monitoring/logger";
import { getMessageSecurityConfig } from "@/lib/security/message-guard";
import { getSecuritySmokeChecklist } from "@/lib/security/smoke";
import { runStatusMaintenance } from "@/lib/statuses";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [clientAccess, monitoring, statusMaintenance] = await Promise.all([
      getClientAccessRegistrySummary(),
      getMonitoringSummary(),
      runStatusMaintenance(),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      messageSecurity: getMessageSecurityConfig(),
      aiRateLimit: getSuggestionRateLimitConfig(),
      clientAccess,
      statusMaintenance,
      monitoring,
      smokeChecklist: getSecuritySmokeChecklist(),
      multiDeviceReadiness: {
        sessionRecoveryFlow: true,
        sharedServerRegistry: true,
        localRuntimeConstraint:
          "Les lectures legacy locales restent supportees temporairement, mais les nouvelles ecritures sensibles doivent passer par Firestore/Storage.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Rapport de durcissement indisponible.",
      },
      {
        status: isChatStorageUnavailableError(error) ? 503 : 500,
      },
    );
  }
}
