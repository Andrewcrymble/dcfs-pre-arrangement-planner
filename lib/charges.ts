// lib/charges.ts
// Live burial & cremation charges from the David Crymble & Sons Control Centre.
// ONE source of truth: the office maintains these in the Control Centre
// (Directory → Burial & cremation charges); this reads the feed so the planner's
// council fees match the public website exactly.
//
// After the website domain moves to Cloudflare, change CHARGES_FEED to
// https://crymbleandsons.com/api/charges (or set NEXT_PUBLIC_CHARGES_URL).

const CHARGES_FEED =
  process.env.NEXT_PUBLIC_CHARGES_URL ||
  "https://crymble-and-sons.pages.dev/api/charges";

export interface Charge {
  council: string;
  kind: string; // "burial" | "cremation" | "memorial"
  item: string;
  resident_amount: string;
  nonresident_amount: string;
  notes: string;
  source_url: string;
  last_verified: string;
  status: string;
}

let _cache: { at: number; charges: Charge[] } | null = null;

export async function fetchCharges(): Promise<Charge[]> {
  if (_cache && Date.now() - _cache.at < 5 * 60_000) return _cache.charges;
  try {
    const res = await fetch(CHARGES_FEED, { cache: "no-store" });
    const json = await res.json();
    _cache = { at: Date.now(), charges: json.charges || [] };
    return _cache.charges;
  } catch {
    return _cache?.charges || [];
  }
}

// postcodes.io admin_district vs our feed council names differ slightly
// (e.g. "Belfast" vs "Belfast City Council"). Normalise both, then match.
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\b(city|borough|district)?\s*council\b/g, "")
    .replace(/[^a-z]/g, "");
}
function num(s: string): number {
  const n = parseFloat((s || "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

export interface CouncilFee {
  label: string;
  amount: number;
}

// THE shared rule, identical to the public website:
//  - Burial: the family's own council, resident or non-resident rate.
//  - Cremation: ONLY Belfast (Roselawn) and Antrim & Newtownabbey have crematoria.
//    Resident rate applies only if the family lives in that crematorium's council;
//    everyone else pays the non-resident rate (default crematorium: Roselawn).
//
// `council` is the postcodes.io admin_district from the wizard's postcode lookup.
export async function councilFee(
  council: string,
  isCremation: boolean,
  residentForBurial = true,
): Promise<CouncilFee | null> {
  if (!council) return null;
  const charges = await fetchCharges();

  if (isCremation) {
    const cremAt = (councilName: string, resident: boolean): number | null => {
      const rows = charges.filter(
        (c) => norm(c.council) === norm(councilName) && c.kind === "cremation",
      );
      return rows.length
        ? num(resident ? rows[0].resident_amount : rows[0].nonresident_amount)
        : null;
    };
    const fam = norm(council);
    if (fam === norm("Belfast")) {
      const v = cremAt("Belfast City Council", true);
      return v != null ? { label: "Cremation fee — Roselawn (Belfast resident)", amount: v } : null;
    }
    if (fam === norm("Antrim and Newtownabbey")) {
      const v = cremAt("Antrim and Newtownabbey", true);
      return v != null ? { label: "Cremation fee — Antrim & Newtownabbey (resident)", amount: v } : null;
    }
    const nr = cremAt("Belfast City Council", false);
    return nr != null ? { label: "Cremation fee — Roselawn (non-resident rate)", amount: nr } : null;
  }

  // Burial — the family's own council.
  const rows = charges.filter(
    (c) => norm(c.council) === norm(council) && c.kind === "burial",
  );
  if (!rows.length) return null;
  const total = rows.reduce(
    (t, c) => t + num(residentForBurial ? c.resident_amount : c.nonresident_amount),
    0,
  );
  return {
    label: `Council burial fees — ${council}${residentForBurial ? "" : " (non-resident)"}`,
    amount: total,
  };
}
