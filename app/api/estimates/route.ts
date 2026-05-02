import { NextResponse } from "next/server";

// Helper that hits the Apps Script web app with a given action+payload and
// returns the parsed JSON response. Centralises the "is Drive configured?"
// + redirect-following + error-shaping logic for both GET and POST handlers.
async function callAppsScript(
  action: string,
  extra: Record<string, unknown> = {},
): Promise<{ data?: unknown; error?: string; status: number }> {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) {
    return { error: "Estimates store is not configured", status: 503 };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, action, ...extra }),
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

export async function PATCH(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { ref, status: newStatus, appointmentDate, sentToWG } = body;
  if (typeof ref !== "string" || ref === "") {
    return NextResponse.json({ error: "ref required" }, { status: 400 });
  }
  const { data, error, status } = await callAppsScript("update_estimate", {
    ref,
    status: newStatus,
    appointmentDate,
    sentToWG,
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
