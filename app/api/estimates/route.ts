import { NextResponse } from "next/server";
import { normalizePhoneForSheet } from "@/lib/phoneFormat";

// Helper that hits the Apps Script web app with a given action+payload and
// returns the parsed JSON response. Centralises the "is Drive configured?"
// + redirect-following + error-shaping logic for both GET and POST handlers.
async function callAppsScript(
  action: string,
  extra: Record<string, unknown> = {},
): Promise<{ data?: unknown; error?: string; status: number }> {
  // Estimates live in the Crymble Hub's D1 database (migrated off the
  // Google Sheet 2026-07-16); same six actions, same row shape.
  const url = "https://crymbleandsons.com/api/planner";
  const secret = process.env.HUB_LETTERS_KEY;
  if (!secret) {
    return { error: "Estimates store is not configured", status: 503 };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: secret, action, ...extra }),
      cache: "no-store",
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, status: 502 };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `Non-JSON response: ${text.slice(0, 200)}`, status: 502 };
    }
    if (data && typeof data === "object" && "error" in data && data.error) {
      return { error: String(data.error), status: 502 };
    }
    return { data, status: 200 };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "request failed",
      status: 500,
    };
  }
}

export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref");
  if (ref) {
    const { data, error, status } = await callAppsScript("get_estimate", { ref });
    if (error) return NextResponse.json({ error }, { status });
    return NextResponse.json(data ?? { estimate: null });
  }
  const { data, error, status } = await callAppsScript("list_estimates");
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { estimates: [] });
}

// Save (or update) an in-progress estimate as a Draft. Mirrors the row
// shape of the upload-pdf path but without a PDF — Apps Script appends or
// upserts the row by Ref. The wizard's "Save & exit" button calls this so
// the arranger can resume the same estimate from any device by opening the
// draft card on the dashboard.
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { estimateId, customer, person, total, selections, partnerRef } = body;
  if (typeof estimateId !== "string" || estimateId === "") {
    return NextResponse.json({ error: "estimateId required" }, { status: 400 });
  }

  // Same phone normalisation the PDF upload path uses — keeps the leading
  // 0 on UK mobile numbers when Apps Script writes them to the sheet.
  const normalizedCustomer =
    customer && typeof customer === "object"
      ? {
          ...(customer as Record<string, unknown>),
          telephone: normalizePhoneForSheet(
            (customer as { telephone?: unknown }).telephone,
          ),
        }
      : customer;
  const normalizedPerson =
    person && typeof person === "object"
      ? {
          ...(person as Record<string, unknown>),
          nextOfKinPhone: normalizePhoneForSheet(
            (person as { nextOfKinPhone?: unknown }).nextOfKinPhone,
          ),
        }
      : person;

  const { data, error, status } = await callAppsScript("save_draft", {
    estimateId,
    customer: normalizedCustomer,
    person: normalizedPerson,
    total,
    selections,
    partnerRef,
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true, ref: estimateId });
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const {
    ref,
    status: newStatus,
    appointmentDate,
    sentToWG,
    quotedDate,
    partnerRef,
  } = body;
  if (typeof ref !== "string" || ref === "") {
    return NextResponse.json({ error: "ref required" }, { status: 400 });
  }
  const { data, error, status } = await callAppsScript("update_estimate", {
    ref,
    status: newStatus,
    appointmentDate,
    sentToWG,
    quotedDate,
    partnerRef,
  });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}

export async function DELETE(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref) return NextResponse.json({ error: "ref required" }, { status: 400 });
  const { data, error, status } = await callAppsScript("delete_estimate", { ref });
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json(data ?? { ok: true });
}
