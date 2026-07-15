import { NextResponse } from "next/server";

// Spelling/grammar check for client-facing text, relayed to the Crymble
// Hub's AI endpoint. Session-protected by the middleware; the shared key
// stays server-side.
const HUB_PROOFREAD_URL = "https://crymbleandsons.com/api/letters/proofread";

export async function POST(req: Request) {
  const key = process.env.HUB_LETTERS_KEY;
  if (!key) {
    return NextResponse.json({
      ok: false,
      error: "The AI check isn't configured on this deployment.",
    });
  }
  let body: { text?: string } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON." }, { status: 400 });
  }
  const text = (body?.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Nothing to check." });
  }
  try {
    const r = await fetch(HUB_PROOFREAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-letters-key": key },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
    });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        "Could not reach the AI service — " +
        (err instanceof Error ? err.message : "network error"),
    });
  }
}
