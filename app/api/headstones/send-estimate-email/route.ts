import { NextResponse } from "next/server";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/send-estimate-email — POST { email, customerName, ref,
// pdfBase64, proofUrl? }
//
// Apps Script wraps this in the standard "Your Memorial Estimate" HTML
// template and attaches the PDF.

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { email, customerName, ref, pdfBase64, proofUrl } = body;
  if (typeof email !== "string" || !email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  if (typeof pdfBase64 !== "string" || !pdfBase64) {
    return NextResponse.json({ error: "pdfBase64 required" }, { status: 400 });
  }
  const { data, error, status } = await callHeadstoneAction("sendEstimateEmail", {
    email,
    customerName,
    ref,
    pdfBase64,
    proofUrl,
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
