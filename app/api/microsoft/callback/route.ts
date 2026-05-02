import { NextResponse } from "next/server";
import {
  exchangeCode,
  whoAmI,
  SETTING_REFRESH_TOKEN,
  SETTING_CONNECTED_USER,
} from "@/lib/microsoft";
import { setSetting } from "@/lib/sheetSettings";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  // Always end this flow on the dashboard with a banner result. Use a
  // simple HTML page so the user gets feedback before the redirect.
  const finishUrl = (status: "ok" | "error", detail?: string) => {
    const u = new URL("/", url.origin);
    u.searchParams.set("ms", status);
    if (detail) u.searchParams.set("ms_detail", detail.slice(0, 200));
    return NextResponse.redirect(u);
  };

  if (error) return finishUrl("error", `${error}: ${errorDesc || ""}`);
  if (!code) return finishUrl("error", "no code returned");

  try {
    const tokens = await exchangeCode(req, code);
    if (!tokens.refresh_token) {
      return finishUrl("error", "no refresh_token in response");
    }
    await setSetting(SETTING_REFRESH_TOKEN, tokens.refresh_token);
    try {
      const me = await whoAmI(tokens.access_token);
      await setSetting(
        SETTING_CONNECTED_USER,
        me.mail || me.userPrincipalName || me.displayName || "",
      );
    } catch {
      // Non-fatal — connection still works without a friendly name.
    }
    return finishUrl("ok");
  } catch (err) {
    return finishUrl("error", err instanceof Error ? err.message : "unknown");
  }
}
