import { NextResponse } from "next/server";
import { getSetting } from "@/lib/sheetSettings";
import { SETTING_CONNECTED_USER, SETTING_REFRESH_TOKEN } from "@/lib/microsoft";

export async function GET() {
  if (!process.env.MS_CLIENT_ID || !process.env.MS_TENANT_ID || !process.env.MS_CLIENT_SECRET) {
    return NextResponse.json({ configured: false, connected: false });
  }
  const refreshToken = await getSetting(SETTING_REFRESH_TOKEN);
  const user = await getSetting(SETTING_CONNECTED_USER);
  return NextResponse.json({
    configured: true,
    connected: Boolean(refreshToken),
    user: user || null,
  });
}
