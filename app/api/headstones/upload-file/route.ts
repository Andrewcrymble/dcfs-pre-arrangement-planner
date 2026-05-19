import { NextResponse } from "next/server";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/upload-file — POST forwards a base64-encoded file
// to the Apps Script's Drive uploader. Body shape matches the upstream:
// { orderId, customerName, deceasedName, fileName, fileType, fileData, mimeType }

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const required = ["orderId", "fileName", "fileData"] as const;
  for (const k of required) {
    if (!(k in body)) {
      return NextResponse.json({ error: `${k} required` }, { status: 400 });
    }
  }
  const { data, error, status } = await callHeadstoneAction("uploadFile", body);
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
