import type { FormState, PriceItem, SelectedLine } from "./types";
import { DIRECT_FUNERAL_TYPES, DIRECT_PACKAGE_DISCOUNT_NAME } from "./types";
import { findItem } from "./sheets";

export function isDirectFuneralType(name: string): boolean {
  return (DIRECT_FUNERAL_TYPES as readonly string[]).includes(name);
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
