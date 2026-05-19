import { NextResponse } from "next/server";
import { fetchHeadstoneIndex } from "@/lib/headstoneAppsScript";

// /api/headstones/price-book — GET returns the price book object
// straight from the headstone Apps Script. Cached upstream is per-call
// so we don't add another layer here.

export async function GET() {
  const { data, error, status } = await fetchHeadstoneIndex();
  if (error) return NextResponse.json({ error }, { status });
  const obj = (data as { priceBook?: unknown }) || {};
  return NextResponse.json({ priceBook: obj.priceBook ?? {} });
}
