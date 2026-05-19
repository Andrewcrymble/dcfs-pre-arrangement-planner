"use client";

// Headstones section = iframe of the existing memorial tracker app.
// Approach chosen so we keep the dashboard nav unified without
// rebuilding the full headstone UI in React. If the embedded URL
// changes, edit HEADSTONE_APP_URL below (or override via the
// NEXT_PUBLIC_HEADSTONE_APP_URL env var in Vercel).

const HEADSTONE_APP_URL =
  process.env.NEXT_PUBLIC_HEADSTONE_APP_URL ||
  "https://andrewcrymble.github.io/dcfs-memorial-tracker/";

export default function HeadstonesPage() {
  return (
    <div className="-mx-4 -my-8 sm:-mx-6 sm:-my-12">
      <div className="border-b border-mist-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="heading-serif text-2xl text-navy-900">
            Headstone orders
          </h1>
          <a
            href={HEADSTONE_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-navy-700 underline-offset-2 hover:underline"
          >
            Open in new tab ↗
          </a>
        </div>
      </div>
      <iframe
        src={HEADSTONE_APP_URL}
        title="DC&S Memorial Tracker"
        className="block h-[calc(100vh-180px)] w-full border-0"
        // sandbox kept permissive so the embedded app keeps full
        // functionality (Apps Script calls, Drive auth, Stripe links).
        // The same-origin allowance is required for any localStorage
        // it uses; remove it if you want a stricter sandbox.
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
