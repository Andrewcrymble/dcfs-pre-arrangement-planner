import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/microsoft";

// Kicks off the Microsoft OAuth flow. Hit this once when first connecting
// the company calendar — the user signs in, consents, and Microsoft
// redirects back to /api/microsoft/callback with a code we can exchange.
export async function GET(req: Request) {
  if (!process.env.MS_CLIENT_ID || !process.env.MS_TENANT_ID || !process.env.MS_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Microsoft Calendar is not configured on the server" },
      { status: 503 },
    );
  }
  const state = crypto.randomUUID();
  const url = authorizeUrl(req, state);
  return NextResponse.redirect(url);
}
