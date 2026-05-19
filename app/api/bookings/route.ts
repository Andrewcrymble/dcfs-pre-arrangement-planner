import { NextResponse } from "next/server";
import { generateEstimateId } from "@/lib/estimate";
import { normalizePhoneForSheet } from "@/lib/phoneFormat";

// Creates a placeholder Estimates row with status="Appointment" — used
// when staff books a customer in over the phone before the in-person
// pre-arrangement meeting. The row is later updated (in place) when the
// wizard is completed for that ref.
//
// Body: { customer: {fullName, telephone, email, branch, arrangementFor},
//         appointmentDate: string }
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const customer = body.customer as
    | { fullName?: string; telephone?: string; email?: string; branch?: string }
    | undefined;
  const appointmentDate = typeof body.appointmentDate === "string" ? body.appointmentDate : "";
  if (!customer?.fullName || customer.fullName.trim() === "") {
    return NextResponse.json({ error: "Customer name required" }, { status: 400 });
  }
  if (!appointmentDate) {
    return NextResponse.json({ error: "Appointment date required" }, { status: 400 });
  }

  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) {
    return NextResponse.json(
      { error: "Bookings store is not configured" },
      { status: 503 },
    );
  }

  const ref = generateEstimateId();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "book_appointment",
        ref,
        customer: {
          ...customer,
          // Keep the leading 0 of UK mobiles when Sheets stores the row.
          telephone: normalizePhoneForSheet(customer.telephone),
        },
        appointmentDate,
      }),
      cache: "no-store",
      redirect: "follow",
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      return NextResponse.json(
        { error: data?.error || `HTTP ${resp.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, ref });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Booking failed" },
      { status: 500 },
    );
  }
}
