import Papa from "papaparse";
import type { PriceItem, PricingCategory } from "./types";
import { FALLBACK_PRICING } from "./fallbackPricing";

const VALID_CATEGORIES: PricingCategory[] = [
  "funeral_type",
  "coffin",
  "transport",
  "additional_service",
  "disbursement",
  "service_choice",
  "discount",
  "admin_fee",
];

function toBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "y" || v === "1" || v === "active";
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normaliseRow(row: Record<string, string>): PriceItem | null {
  const category = (row.category || "").trim().toLowerCase() as PricingCategory;
  const item_name = (row.item_name || "").trim();
  if (!item_name) return null;
  if (!VALID_CATEGORIES.includes(category)) return null;

  return {
    category,
    item_name,
    description: (row.description || "").trim(),
    price: toNumber(row.price),
    active: toBool(row.active),
    sort_order: toNumber(row.sort_order),
  };
}

export interface FetchResult {
  items: PriceItem[];
  source: "sheet" | "fallback";
  error?: string;
}

export async function fetchPricing(): Promise<FetchResult> {
  const url = process.env.NEXT_PUBLIC_SHEETS_CSV_URL;
  const useFallback = process.env.NEXT_PUBLIC_USE_FALLBACK_PRICING === "true";

  if (!url) {
    if (useFallback) return { items: FALLBACK_PRICING, source: "fallback" };
    return {
      items: [],
      source: "fallback",
      error:
        "Pricing sheet URL is not configured. Please set NEXT_PUBLIC_SHEETS_CSV_URL.",
    };
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
    }
    const csv = await res.text();
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    const items = parsed.data
      .map(normaliseRow)
      .filter((x): x is PriceItem => x !== null && x.active)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (items.length === 0) {
      throw new Error("Sheet loaded but contained no active pricing rows.");
    }

    return { items, source: "sheet" };
  } catch (err) {
    if (useFallback) {
      return {
        items: FALLBACK_PRICING,
        source: "fallback",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
    return {
      items: [],
      source: "fallback",
      error: err instanceof Error ? err.message : "Unable to load pricing.",
    };
  }
}

export function itemsByCategory(items: PriceItem[], category: PricingCategory): PriceItem[] {
  return items.filter((i) => i.category === category);
}

export function findItem(
  items: PriceItem[],
  category: PricingCategory,
  name: string,
): PriceItem | undefined {
  return items.find((i) => i.category === category && i.item_name === name);
}

export function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
