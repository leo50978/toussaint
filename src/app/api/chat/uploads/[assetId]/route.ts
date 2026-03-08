import { NextResponse } from "next/server";

import { readChatUpload } from "@/lib/chat/media-server";

export const runtime = "nodejs";
const INLINE_SAFE_CHAT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
]);

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

function resolveContentDisposition(kind: string, fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.split(";")[0]?.trim().toLowerCase() || "";
  const dispositionType =
    kind === "file" || !INLINE_SAFE_CHAT_MIME_TYPES.has(normalizedMimeType)
      ? "attachment"
      : "inline";

  return `${dispositionType}; filename="${fileName}"`;
}

export async function GET(request: Request, context: RouteContext) {
  const { assetId } = await context.params;
  const normalizedAssetId = assetId.trim();
  const accessKey = new URL(request.url).searchParams.get("k");

  if (!normalizedAssetId) {
    return NextResponse.json(
      {
        error: "Asset introuvable.",
      },
      {
        status: 404,
      },
    );
  }

  const payload = await readChatUpload(normalizedAssetId, accessKey);

  if (!payload) {
    return NextResponse.json(
      {
        error: "Media introuvable.",
      },
      {
        status: 404,
      },
    );
  }

  return new NextResponse(payload.buffer, {
    status: 200,
    headers: {
      "Content-Type": payload.metadata.mimeType || "application/octet-stream",
      "Content-Length": String(payload.metadata.fileSize),
      "Cache-Control": "private, no-store",
      "Content-Disposition": resolveContentDisposition(
        payload.metadata.kind,
        payload.metadata.fileName,
        payload.metadata.mimeType,
      ),
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
    },
  });
}
