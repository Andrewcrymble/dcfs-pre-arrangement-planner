import { NextResponse } from "next/server";
import { fetchProofData } from "@/lib/headstoneAppsScript";

// /api/headstones/proof-data?id=<orderId>
// Public GET — backs the customer proof page. Returns { proof } as
// shaped by the headstone Apps Script's getProofData().

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error, status } = await fetchProofData(id);
  if (error) return NextResponse.json({ error }, { status });
  const obj = (data as { proof?: unknown }) || {};
  return NextResponse.json({ proof: obj.proof ?? null });
}
