import { NextResponse } from "next/server";

// Server-side proxy to Beepmate so the API key is never exposed in the
// browser. The client POSTs { message } here; this route forwards to
// https://beepmate.io/send with key + chat ID from server-only env vars.
export async function POST(req: Request) {
  let payload: { message?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { message } = payload;
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const key = process.env.BEEPMATE_API_KEY;
  const id = process.env.BEEPMATE_CHAT_ID;
  if (!key || !id) {
    return NextResponse.json(
      { error: "Beepmate is not configured on the server" },
      { status: 500 },
    );
  }

  const url =
    "https://beepmate.io/send" +
    `?key=${encodeURIComponent(key)}` +
    `&id=${encodeURIComponent(id)}` +
    `&msg=${encodeURIComponent(message)}`;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    const text = await resp.text();
    if (!resp.ok) {
      // Beepmate sometimes returns a 500 with an empty body when the
      // message contains characters their parser doesn't like, or when
      // the URL exceeds their internal limit. Surface the encoded URL
      // length and a hint so the toast/log narrows it down.
      const ctype = resp.headers.get("content-type") || "(no content-type)";
      const bodySample = text.trim() === "" ? "(empty body)" : text.slice(0, 200);
      console.error(
        `[beepmate] ${resp.status} from ${url.replace(/key=[^&]+/, "key=***")} — ` +
          `msgLen=${message.length} encodedUrlLen=${url.length} ctype=${ctype} body=${bodySample}`,
      );
      return NextResponse.json(
        {
          error:
            `Beepmate returned ${resp.status} (${bodySample}) — ` +
            `msg ${message.length} chars, encoded URL ${url.length} chars. ` +
            "If the message contains a long Drive link or unusual characters, that's a likely cause.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "request failed" },
      { status: 500 },
    );
  }
}
