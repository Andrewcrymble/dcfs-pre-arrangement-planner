import { NextResponse } from "next/server";

// Public PDF redirect — masks the underlying Google Drive URL behind a
// crymbleandsons.com link in WhatsApp / email / SMS so customers see a
// branded URL rather than `drive.google.com/file/d/...`. The route looks
// up the Estimates row by ref via Apps Script and 302s to the stored
// PDF URL. Anyone with the ref can view the PDF (which already has
// "anyone with link" sharing on the Drive file), so this is no less
// public than the bare Drive URL.
export async function GET(
  _req: Request,
  { params }: { params: { ref: string } },
) {
  const ref = decodeURIComponent(params.ref || "").trim();
  if (!ref) {
    return new NextResponse("Reference required", { status: 400 });
  }

  // Estimate rows live in the Crymble Hub (D1); old rows still carry Drive
  // PDF URLs, new ones carry crymbleandsons.com URLs — both redirect fine.
  const url = "https://crymbleandsons.com/api/planner";
  const secret = process.env.HUB_LETTERS_KEY;
  if (!secret) {
    return new NextResponse("Service unavailable", { status: 503 });
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: secret, action: "get_estimate", ref }),
      cache: "no-store",
      redirect: "follow",
    });
    if (!resp.ok) {
      return new NextResponse(`Lookup failed (${resp.status})`, { status: 502 });
    }
    const data = await resp.json();
    const pdfUrl: unknown = data?.estimate?.["PDF URL"];
    if (typeof pdfUrl !== "string" || !pdfUrl) {
      return new NextResponse("PDF not found for this reference", { status: 404 });
    }
    return NextResponse.redirect(pdfUrl, { status: 302 });
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Lookup failed",
      { status: 500 },
    );
  }
}
