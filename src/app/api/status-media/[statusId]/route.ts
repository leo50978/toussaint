import { NextResponse } from "next/server";

import { readStatusMedia } from "@/lib/statuses";

export const runtime = "nodejs";
const INLINE_SAFE_STATUS_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

type RouteContext = {
  params: Promise<{
    statusId: string;
  }>;
};

function resolveStatusContentDisposition(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.split(";")[0]?.trim().toLowerCase() || "";
  const dispositionType = INLINE_SAFE_STATUS_MIME_TYPES.has(normalizedMimeType)
    ? "inline"
    : "attachment";

  return `${dispositionType}; filename="${fileName || "status-media"}"`;
}

export async function GET(_: Request, context: RouteContext) {
  const { statusId } = await context.params;
  const media = await readStatusMedia(statusId);

  if (!media) {
    return NextResponse.json(
      {
        error: "Media introuvable ou expire.",
      },
      {
        status: 404,
      },
    );
  }

  return new NextResponse(new Uint8Array(media.fileBuffer), {
    headers: {
      "Content-Type": media.status.mimeType || "application/octet-stream",
      "Content-Length": String(media.fileBuffer.byteLength),
      "Cache-Control": "private, no-store",
      "Content-Disposition": resolveStatusContentDisposition(
        media.status.originalName || media.status.fileName,
        media.status.mimeType,
      ),
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
