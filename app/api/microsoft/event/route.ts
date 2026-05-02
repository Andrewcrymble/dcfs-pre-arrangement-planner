import { NextResponse } from "next/server";
import { createEvent } from "@/lib/microsoft";

// Creates a calendar event in the connected user's Outlook. Called by the
// dashboard when a new appointment is booked or an existing record is
// promoted from Quoted to Appointment.
//
// Body: { subject, start (ISO), end (ISO), location?, body? }
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { subject, start, end, location, bodyHtml } = body;
  if (typeof subject !== "string" || typeof start !== "string" || typeof end !== "string") {
    return NextResponse.json(
      { error: "subject, start, end required (ISO strings)" },
      { status: 400 },
    );
  }
  try {
    const result = await createEvent({
      subject,
      start,
      end,
      location: typeof location === "string" ? location : undefined,
      bodyHtml: typeof bodyHtml === "string" ? bodyHtml : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "createEvent failed" },
      { status: 500 },
    );
  }
}
