import { NextResponse } from "next/server";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/payment-link — POST creates a Stripe payment link
// via the headstone Apps Script. Stripe itself is wired only to that
// Apps Script (webhook URL unchanged); this just forwards the request.

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const required = ["orderId", "amountPence"] as const;
  for (const k of required) {
    if (!(k in body)) {
      return NextResponse.json({ error: `${k} required` }, { status: 400 });
    }
  }
  const { data, error, status } = await callHeadstoneAction(
    "createPaymentLink",
    body,
  );
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
