// app/api/web-estimates/route.ts
// Server-side proxy so the secret key never reaches the browser.
//   GET  -> list new web estimates
//   POST {id, status} -> mark one as picked up
import { NextResponse } from "next/server";
import { fetchWebEstimates, markWebEstimate } from "@/lib/webEstimates";

export const dynamic = "force-dynamic";

export async function GET() {
  const leads = await fetchWebEstimates();
  return NextResponse.json({ leads });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body && typeof body.id === "number") {
    await markWebEstimate(body.id, body.status || "reviewing");
  }
  return NextResponse.json({ ok: true });
}
