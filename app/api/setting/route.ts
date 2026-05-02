import { NextResponse } from "next/server";
import { getSetting } from "@/lib/sheetSettings";

// Read a single value from the Settings tab of the spreadsheet via Apps
// Script. Used by the wizard's Summary page to pull the instalment APR
// (key: instalment_apr) at render time so a non-technical user can change
// the rate by editing one cell in the spreadsheet — no redeploy required.
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  const value = await getSetting(key);
  return NextResponse.json({ key, value });
}
