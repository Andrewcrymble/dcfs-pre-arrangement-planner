import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { callHeadstoneAction } from "@/lib/headstoneAppsScript";

// /api/headstones/notify-mason — POST { orderId, force?: boolean }
// Uses the signed-in staff name as the triggeredBy attribution.

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { orderId, force } = body;
  if (typeof orderId !== "string" || !orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);
  const { data, error, status } = await callHeadstoneAction("notifyMason", {
    orderId,
    triggeredBy: session?.name || "Staff",
    force: !!force,
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
