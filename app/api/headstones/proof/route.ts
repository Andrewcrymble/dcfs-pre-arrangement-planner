import { NextResponse } from "next/server";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/proof — public POST. The customer-facing proof page
// hits this from a public URL, so we don't gate it on session here.
// (Middleware already whitelists /p/proof and this route.)
//
// Body: { orderId, approved: boolean, message?: string }

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId, approved, message } = body;
  if (typeof orderId !== "string" || !orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  const { data, error, status } = await callHeadstoneAction("submitProofResponse", {
    orderId,
    approved: !!approved,
    message: typeof message === "string" ? message : "",
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
