import { redirect } from "next/navigation";

// /headstones — the existing memorial tracker app rejects iframe
// embedding (X-Frame-Options / CSP frame-ancestors), so we send the
// user straight there instead. Browser back returns to the dashboard.
//
// Override the destination with NEXT_PUBLIC_HEADSTONE_APP_URL in Vercel
// if the tracker moves.

const HEADSTONE_APP_URL =
  process.env.NEXT_PUBLIC_HEADSTONE_APP_URL ||
  "https://tracker.crymbleandsons.com/";

export default function HeadstonesPage() {
  redirect(HEADSTONE_APP_URL);
}
