import type { FormState, PriceItem, SelectedLine } from "./types";
import { DIRECT_FUNERAL_TYPES, DIRECT_PACKAGE_DISCOUNT_NAME } from "./types";
import { findItem } from "./sheets";

export function isDirectFuneralType(name: string): boolean {
  return (DIRECT_FUNERAL_TYPES as readonly string[]).includes(name);
}

// "With Grace" instalment terms: first 24 months interest-free, then 6% APR
// on the remaining balance. Equal monthly payment throughout.
export const INSTALMENT_INTEREST_FREE_MONTHS = 24;
export const INSTALMENT_APR = 0.06;

// Finance is only offered while the plan holder is paying before age 80.
// e.g. a 71-year-old can finance for 8 years (final payment at 79, still
// under 80). Above this age, no finance is offered.
export const FINANCE_MAX_AGE = 80;

// Absolute ceiling on the finance term — even a 50-year-old who could
// in theory pay for 29 years before hitting FINANCE_MAX_AGE is offered
// at most 5 years. Acts in concert with the age cap; whichever is
// shorter wins.
export const FINANCE_MAX_TERM_YEARS = 5;

export interface MonthlyOption {
  months: number;
  yearLabel: string;
  monthly: number;
  totalPaid: number;
  financeCharge: number;
  isFinanced: boolean;
}

// Solves for the equal monthly payment M such that during the IF window M
// pays principal at no interest, and the remaining balance is amortized at
// the monthly rate over the post-IF window with the same M:
//   M = P·r / (1 + IF·r − (1+r)^−n)   where n = months − IF
// `apr` is fractional (0.06 for 6%). Defaults to INSTALMENT_APR but the
// caller can pass a value pulled from the Settings sheet at runtime.
//
// `maxMonths` (optional) drops longer-term options from the returned list.
// Used so a 75-year-old (cap: 48 months) doesn't get offered an 8-year
// plan that would run past the FINANCE_MAX_AGE cutoff.
export function monthlyInstalmentOptions(
  grandTotal: number,
  apr: number = INSTALMENT_APR,
  maxMonths?: number,
): MonthlyOption[] {
  const r = apr / 12;
  const compute = (months: number): number => {
    if (grandTotal <= 0 || months <= 0) return 0;
    if (months <= INSTALMENT_INTEREST_FREE_MONTHS) return grandTotal / months;
    const n = months - INSTALMENT_INTEREST_FREE_MONTHS;
    const denom = 1 + INSTALMENT_INTEREST_FREE_MONTHS * r - Math.pow(1 + r, -n);
    return (grandTotal * r) / denom;
  };
  const allTerms: Array<[number, string]> = [
    [12, "1 year"],
    [24, "2 years"],
    [36, "3 years"],
    [48, "4 years"],
    [60, "5 years"],
    [72, "6 years"],
    [84, "7 years"],
    [96, "8 years"],
    [108, "9 years"],
    [120, "10 years"],
  ];
  // Absolute ceiling — even if the caller passes a larger maxMonths (or
  // none at all), no plan beyond FINANCE_MAX_TERM_YEARS is offered.
  const hardCeiling = FINANCE_MAX_TERM_YEARS * 12;
  const requestedCap =
    typeof maxMonths === "number" && maxMonths > 0 ? maxMonths : hardCeiling;
  const cap = Math.min(requestedCap, hardCeiling);
  return allTerms
    .filter(([months]) => months <= cap)
    .map(([months, yearLabel]) => {
      const monthly = compute(months);
      const totalPaid = monthly * months;
      return {
        months,
        yearLabel,
        monthly,
        totalPaid,
        financeCharge: Math.max(0, totalPaid - grandTotal),
        isFinanced: months > INSTALMENT_INTEREST_FREE_MONTHS,
      };
    });
}

// Age in completed years on `at` (defaults to today). Returns null when
// the DOB string is empty or unparseable so callers can disambiguate
// "unknown" from "0 years old".
export function ageInYears(dob: string | undefined, at: Date = new Date()): number | null {
  if (!dob) return null;
  // Accept both ISO YYYY-MM-DD (the form's <input type="date"> output)
  // and free-text dates that Date can parse — older records used the
  // latter.
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = at.getFullYear() - d.getFullYear();
  const monthDiff = at.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

// Max financeable months given the plan holder's age. Final payment
// must land before the holder reaches FINANCE_MAX_AGE, and the term
// is additionally capped at FINANCE_MAX_TERM_YEARS — whichever is
// shorter wins.
//   - age 50 → 10 years (29 yrs allowed by age, but 10-year ceiling)
//   - age 65 → 10 years (14 yrs allowed by age, but 10-year ceiling)
//   - age 69 → 10 years (10 yrs allowed by age, ceiling matches)
//   - age 71 → 8 years  (last payment at 79)
//   - age 75 → 4 years  (last payment at 79)
//   - age 79 → 0 years  (no finance)
//   - age 80+ → 0 years (no finance)
// Returns null when age is unknown — callers should treat that as
// "no age cap" (the 10-year ceiling still applies via the options fn).
export function maxFinanceMonthsForAge(age: number | null): number | null {
  if (age === null) return null;
  const ageYears = Math.max(0, FINANCE_MAX_AGE - 1 - age);
  const cappedYears = Math.min(ageYears, FINANCE_MAX_TERM_YEARS);
  return cappedYears * 12;
}

// Pulls the plan-holder's DOB out of a FormState. The customer is the
// plan holder when arrangementFor === "Myself"; otherwise the dedicated
// person block carries it.
export function planHolderDob(form: FormState): string {
  if (form.customer.arrangementFor === "Someone else") {
    return form.person.dateOfBirth || "";
  }
  return form.customer.dateOfBirth || "";
}

// Internal reference for an estimate. Format: DCFS-YYMMDD-XXXX.
// Date-sortable so we can find recent ones at a glance; the 4-hex-char
// suffix is enough to avoid collisions for the volume the office sees.
// Used in the PDF, the WhatsApp message, and the Drive filename so a
// reference quoted by a customer maps back to a single document.
export function generateEstimateId(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const bytes = new Uint8Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 256);
    bytes[1] = Math.floor(Math.random() * 256);
  }
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  return `DCFS-${yy}${mm}${dd}-${suffix}`;
}

// These disbursement items are already covered inside the direct cremation /
// direct burial price, so they should be hidden on the disbursements step and
// stripped from any selections to avoid double-charging.
export const BUNDLED_DISBURSEMENTS_FOR_DIRECT = [
  "Crematorium fee",
  "Burial fee",
  "Doctor's fee",
  "Grave opening fee",
];

export function isBundledForDirect(name: string): boolean {
  return BUNDLED_DISBURSEMENTS_FOR_DIRECT.includes(name);
}

export function buildSelectedLines(form: FormState, items: PriceItem[]): SelectedLine[] {
  const lines: SelectedLine[] = [];

  const push = (category: PriceItem["category"], name: string) => {
    if (!name) return;
    const match = findItem(items, category, name);
    if (match) {
      lines.push({
        category: match.category,
        item_name: match.item_name,
        description: match.description,
        price: match.price,
      });
    } else {
      lines.push({ category, item_name: name, description: "", price: 0 });
    }
  };

  push("funeral_type", form.funeralType);
  push("service_choice", form.serviceChoice);
  push("coffin", form.coffin);
  form.transport.forEach((t) => push("transport", t));
  form.additionalServices.forEach((s) => push("additional_service", s));

  const direct = isDirectFuneralType(form.funeralType);
  form.disbursements
    .filter((d) => !(direct && isBundledForDirect(d)))
    .forEach((d) => push("disbursement", d));

  // Ad-hoc custom disbursements added by the arranger on the form.
  form.customDisbursements
    .filter((c) => c.label.trim() !== "")
    .forEach((c) =>
      lines.push({
        category: "disbursement",
        item_name: c.label.trim(),
        description: "",
        price: Number.isFinite(c.price) ? c.price : 0,
      }),
    );

  if (form.directPackageDiscount && direct) {
    push("discount", DIRECT_PACKAGE_DISCOUNT_NAME);
  }

  // Admin fees are automatically applied to every plan.
  items
    .filter((i) => i.category === "admin_fee")
    .forEach((i) =>
      lines.push({
        category: "admin_fee",
        item_name: i.item_name,
        description: i.description,
        price: i.price,
      }),
    );

  return lines;
}

export function totalsForLines(lines: SelectedLine[]) {
  // Funeral subtotal = everything except disbursements (discount lines have
  // negative prices, so they reduce the funeral subtotal automatically).
  const funeralTotal = lines
    .filter((l) => l.category !== "disbursement")
    .reduce((sum, l) => sum + l.price, 0);
  const disbursementsTotal = lines
    .filter((l) => l.category === "disbursement")
    .reduce((sum, l) => sum + l.price, 0);
  return {
    funeralTotal,
    disbursementsTotal,
    grandTotal: funeralTotal + disbursementsTotal,
  };
}

export const PDF_DISCLAIMER =
  "This document is an estimate only and is based on the choices selected at the time of preparation. Final costs may vary depending on personal choices, third-party fees, cemetery or crematorium charges, and any additional requirements. For an accurate funeral quotation, please speak directly with the team at David Crymble & Sons Funeral Directors.";
