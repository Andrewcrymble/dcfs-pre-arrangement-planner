import { NextResponse } from "next/server";

// Read-only summary feed for the David Crymble & Sons website Control Centre
// dashboard. Key-protected (?key=… or an x-feed-key header, matching the
// FEED_KEY env var) and intentionally public in middleware so the website
// worker can call it server-to-server WITHOUT a staff login session. It only
// ever returns compact counts + a few recent plans — never the full estimate
// store. Mirrors the website's own estimate-leads feed pattern in reverse.
export const dynamic = "force-dynamic";

// Pull the full estimates list from the same Apps Script "Drive store" the
// dashboard's /api/estimates GET uses (action: list_estimates).
async function listEstimates(): Promise<Record<string, unknown>[]> {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) return [];
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret, action: "list_estimates" }),
    cache: "no-store",
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`store HTTP ${resp.status}`);
  const data = (await resp.json()) as { estimates?: unknown } | null;
  const list = data?.estimates;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

export async function GET(req: Request) {
  const key = process.env.FEED_KEY;
  const provided =
    new URL(req.url).searchParams.get("key") ||
    req.headers.get("x-feed-key") ||
    "";
  if (!key || provided !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await listEstimates();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "feed failed" },
      { status: 502 },
    );
  }

  const str = (v: unknown): string => (v == null ? "" : String(v));
  const norm = (v: unknown): string => str(v).trim().toLowerCase();
  const count = (s: string): number => rows.filter((r) => norm(r.Status) === s).length;

  const counts = {
    total: rows.length,
    draft: count("draft"),
    appointment: count("appointment"),
    quoted: count("quoted"),
    sentToWG: count("sent to wg"),
  };

  // Most-recently-created first. Handles ISO and dd/mm/yyyy date strings.
  const parseDate = (v: unknown): number => {
    const s = str(v).trim();
    const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) return new Date(+dm[3], +dm[2] - 1, +dm[1]).getTime() || 0;
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  };
  const recent = rows
    .slice()
    .sort((a, b) => parseDate(b.Created) - parseDate(a.Created))
    .slice(0, 8)
    .map((r) => ({
      ref: str(r.Ref),
      customer: str(r.Customer),
      person: str(r.Person),
      status: str(r.Status),
      total: str(r.Total),
      created: str(r.Created),
      appointmentDate: str(r["Appointment Date"]),
    }));

  return NextResponse.json(
    { ok: true, counts, recent },
    { headers: { "cache-control": "no-store" } },
  );
}
