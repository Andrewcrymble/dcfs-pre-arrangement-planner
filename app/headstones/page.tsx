import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";

// /headstones — server-side redirect to the existing memorial tracker.
// If the user is logged into this app, we pass their name through as
// ?ssoUser=<name> so the tracker's login IIFE skips its password
// prompt (see dcfs-memorial-tracker-project/index.html).
//
// Override the destination with NEXT_PUBLIC_HEADSTONE_APP_URL in Vercel
// if the tracker moves.

const HEADSTONE_APP_URL =
  process.env.NEXT_PUBLIC_HEADSTONE_APP_URL ||
  "https://tracker.crymbleandsons.com/";

export default async function HeadstonesPage() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);
  const url = session?.name
    ? `${HEADSTONE_APP_URL}?ssoUser=${encodeURIComponent(session.name)}`
    : HEADSTONE_APP_URL;
  redirect(url);
}
