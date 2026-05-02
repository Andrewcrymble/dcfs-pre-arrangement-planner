import { NextResponse } from "next/server";

// Server-side proxy to a Google Apps Script web app that stores the PDF in
// our Drive folder and returns a shareable link. The shared secret stays on
// the server side so the Apps Script URL can be called by anyone (it has to
// be — Apps Script web apps with restricted access can't accept POSTs from
// arbitrary origins) without anyone being able to actually upload.
//
// The client posts { pdfBase64, filename } to this route; we add the secret
// and forward to DRIVE_UPLOAD_URL.
export async function POST(req: Request) {
  let payload: { pdfBase64?: unknown; filename?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { pdfBase64, filename } = payload;
  if (typeof pdfBase64 !== "string" || pdfBase64.length === 0) {
    return NextResponse.json({ error: "pdfBase64 required" }, { status: 400 });
  }

  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) {
    return NextResponse.json(
      { error: "Drive upload is not configured on the server" },
      { status: 503 },
    );
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        pdfBase64,
        filename: typeof filename === "string" ? filename : "estimate.pdf",
      }),
      cache: "no-store",
      // Apps Script web apps usually 302 from /exec to a googleusercontent
      // URL that returns the actual JSON. fetch follows redirects by default.
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Drive uploader returned ${resp.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
    let data: { url?: string; id?: string; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Drive uploader returned non-JSON: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 502 });
    }
    if (!data.url) {
      return NextResponse.json({ error: "Drive uploader returned no URL" }, { status: 502 });
    }
    return NextResponse.json({ url: data.url, id: data.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "request failed" },
      { status: 500 },
    );
  }
}
