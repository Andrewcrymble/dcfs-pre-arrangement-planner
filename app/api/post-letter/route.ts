import { NextResponse } from "next/server";

// Post an estimate by REAL letter through the Crymble Hub's postal service
// (Stannp behind /api/letters/post). This route is session-protected by the
// middleware, and the letters key stays server-side — the browser never
// sees it. The Hub logs the letter on its Comms board like every other one.
const HUB_LETTERS_URL = "https://crymbleandsons.com/api/letters/post";

export async function POST(req: Request) {
  const key = process.env.HUB_LETTERS_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Letter posting isn't configured on this deployment (HUB_LETTERS_KEY is missing).",
      },
      { status: 503 },
    );
  }

  let body: {
    pdf?: string;
    name?: string;
    address?: string;
    doc_name?: string;
    ref?: string;
  } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON." }, { status: 400 });
  }
  if (!body?.pdf || !body?.name || !body?.address) {
    return NextResponse.json(
      { ok: false, error: "A PDF, recipient name and address are required." },
      { status: 400 },
    );
  }

  try {
    const r = await fetch(HUB_LETTERS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-letters-key": key },
      body: JSON.stringify({
        pdf: body.pdf,
        name: body.name,
        address: body.address,
        doc_name: (body.doc_name || "Pre-arrangement estimate").slice(0, 60),
      }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      price?: string;
    };
    // Paper trail: note the posting on the estimate's record (best-effort).
    if (j?.ok && body.ref) {
      try {
        await fetch("https://crymbleandsons.com/api/planner", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key,
            action: "update_estimate",
            ref: body.ref,
            postNote:
              "📮 Posted by letter to " +
              (body.name || "") +
              (j.price ? " (" + j.price + ")" : ""),
          }),
        });
      } catch {
        // logging must never fail the post itself
      }
    }
    // Always relay as 200 with ok:true/false — the wizard reads the body.
    return NextResponse.json(j);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        "Could not reach the postal service — " +
        (err instanceof Error ? err.message : "network error"),
    });
  }
}
