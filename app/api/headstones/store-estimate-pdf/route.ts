import { NextResponse } from "next/server";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/store-estimate-pdf — POST { orderId, ref, pdfBase64 }
// Forwards the client-generated estimate PDF to the headstone Apps
// Script, which writes it to Drive and stamps the Files JSON column
// on the order row.

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId, ref, pdfBase64 } = body;
  if (typeof orderId !== "string" || !orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  if (typeof pdfBase64 !== "string" || !pdfBase64) {
    return NextResponse.json({ error: "pdfBase64 required" }, { status: 400 });
  }
  const { data, error, status } = await callHeadstoneAction("storeEstimatePdf", {
    orderId,
    ref: typeof ref === "string" ? ref : orderId.slice(-8).toUpperCase(),
    pdfBase64,
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
