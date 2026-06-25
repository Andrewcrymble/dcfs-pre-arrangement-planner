// lib/webEstimates.ts
// Funeral estimates families submit on the public website
// (crymbleandsons.com/funeral-estimate) so staff can open one pre-filled in
// the wizard instead of re-keying it.
//
// fetchWebEstimates() / markWebEstimate() are SERVER-SIDE ONLY (they use the
// secret key) — call them from an API route, never the browser.
// webEstimateToFormState() is a pure mapping and is safe to use anywhere.
//
// Set in Vercel:
//   WEB_ESTIMATES_KEY = <same secret set on the website as ESTIMATE_FEED_KEY>
//   WEB_ESTIMATES_URL = https://crymble-and-sons.pages.dev/api/estimate-leads
//     (change to https://crymbleandsons.com/api/estimate-leads after the domain move)

import type { FormState } from "./types";

const FEED =
  process.env.WEB_ESTIMATES_URL ||
  "https://crymble-and-sons.pages.dev/api/estimate-leads";
const KEY = process.env.WEB_ESTIMATES_KEY || "";

export interface WebEstimateSelections {
  funeral_type: string;
  isCremation: boolean;
  coffin: string;
  transport: string;
  additional: string[];
  resident: boolean;
  council: string;
  postcode: string;
}

export interface WebEstimate {
  id: number;
  name: string;
  email: string;
  phone: string;
  postcode: string;
  council: string;
  funeral_type: string;
  total: string;
  selections: WebEstimateSelections | null;
  status: string;
  created: string;
}

/** New web estimates awaiting pickup (server-side only). */
export async function fetchWebEstimates(): Promise<WebEstimate[]> {
  if (!KEY) return [];
  try {
    const r = await fetch(FEED, { headers: { "x-feed-key": KEY }, cache: "no-store" });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.leads as WebEstimate[]) || [];
  } catch {
    return [];
  }
}

/** Mark a web estimate as picked up so it drops off the inbox (server-side only). */
export async function markWebEstimate(
  id: number,
  status: "reviewing" | "accepted" | "rejected" = "reviewing",
): Promise<void> {
  if (!KEY) return;
  try {
    await fetch(FEED, {
      method: "POST",
      headers: { "content-type": "application/json", "x-feed-key": KEY },
      body: JSON.stringify({ id, status }),
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Build a wizard draft from a web estimate. The item labels already match your
 * pricing sheet (funeral_type / coffin / transport / additional_service), so they
 * land straight on the selection steps. Saved via saveDraft(), then the wizard
 * (app/new) loads it on open.
 */
export function webEstimateToFormState(e: WebEstimate): FormState {
  const s = e.selections;
  return {
    customer: {
      fullName: e.name || "",
      telephone: e.phone || "",
      email: e.email || "",
      address: e.postcode || "", // postcode -> address drives the council lookup
      branch: "",
      arrangementFor: "",
      councilDistrict: e.council || "",
    },
    person: {
      fullName: "",
      dateOfBirth: "",
      address: "",
      relationship: "",
      doctorName: "",
      nextOfKinName: "",
      nextOfKinPhone: "",
    },
    funeralType: s?.funeral_type || e.funeral_type || "",
    serviceChoice: "",
    coffin: s?.coffin || "",
    transport: s?.transport ? [s.transport] : [],
    additionalServices: s?.additional || [],
    disbursements: [],
    customDisbursements: [],
    customDiscounts: [],
    wishes: { officiant: "", music: "", readings: "", flowers: "", dressCode: "", catering: "", other: "" },
    directPackageDiscount: false,
    arrangerNotes: [
      {
        id: "web-" + e.id,
        arranger: "Website",
        timestamp: e.created || new Date().toISOString(),
        text: `Imported from website estimate #${e.id}. Family's guide total ${e.total}.`,
      },
    ],
    deposit: 0,
    notesForClient: "",
    showFinanceOptions: true,
  };
}
