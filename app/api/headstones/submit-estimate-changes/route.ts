import { NextResponse } from "next/server";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/submit-estimate-changes — POST { orderId, changes }
// Public route (no session required) — customers hit this from the
// estimate-decline flow on the proof page. Whitelisted in middleware.

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId, changes } = body;
  if (typeof orderId !== "string" || !orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  const { data, error, status } = await callHeadstoneAction(
    "submitEstimateChanges",
    { orderId, changes: typeof changes === "string" ? changes : "" },
  );
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
