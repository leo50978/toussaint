import { NextResponse } from "next/server";

import { createOwnerStatus, listOwnerStatuses } from "@/lib/statuses";

export const runtime = "nodejs";

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

export async function GET() {
  const result = await listOwnerStatuses();

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const type = String(formData.get("type") || "text");
  const content = String(formData.get("content") || "");
  const fileValue = formData.get("file");

  try {
    const result = await createOwnerStatus({
      type: type === "image" || type === "video" ? type : "text",
      content,
      file: isUploadedFile(fileValue) ? fileValue : null,
    });

    return NextResponse.json(result, {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Creation du statut impossible.",
      },
      {
        status: 400,
      },
    );
  }
}
