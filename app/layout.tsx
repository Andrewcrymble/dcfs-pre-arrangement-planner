import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pre-Arranged Funeral Estimate Tool — David Crymble & Sons",
  description:
    "A guided way to explore pre-arranged funeral options and receive a personalised estimate from David Crymble & Sons Funeral Directors.",
};

// Explicit viewport so phones / iPads render at sensible scale. We
// deliberately allow user zoom (no maximum-scale lock) — staff will
// often want to enlarge text on a small screen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#569320",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-navy-600 text-white">
            <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-6 sm:py-5">
              <div>
                <p className="heading-serif text-2xl leading-tight sm:text-3xl">
                  David Crymble &amp; Sons
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-gold-300 sm:text-sm">
                  Funeral Directors
                </p>
              </div>
              <div className="text-sm text-mist-100 sm:text-right">
                <p className="hidden sm:block">Woodstock Road · Finaghy</p>
                <p className="hidden text-gold-300 sm:block">
                  {process.env.NEXT_PUBLIC_BUSINESS_PHONE || "028 9066 7784"}
                </p>
                {session && (
                  <p className="text-xs text-mist-100/80 sm:mt-1">
                    Signed in as <span className="font-semibold">{session.name}</span>
                    {" · "}
                    <SignOutButton />
                  </p>
                )}
                {session && (
                  <nav className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mist-100/90 sm:mt-1 sm:justify-end">
                    <a href="/" className="underline-offset-2 hover:text-white hover:underline">
                      Dashboard
                    </a>
                    <a
                      href="/new"
                      className="underline-offset-2 hover:text-white hover:underline"
                    >
                      New estimate
                    </a>
                    <a
                      href="/calculator"
                      className="underline-offset-2 hover:text-white hover:underline"
                    >
                      Calculator
                    </a>
                    <a
                      href="/change-password"
                      className="underline-offset-2 hover:text-white hover:underline"
                    >
                      Change password
                    </a>
                    {process.env.NEXT_PUBLIC_SHEETS_EDIT_URL && (
                      <a
                        href={process.env.NEXT_PUBLIC_SHEETS_EDIT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:text-white hover:underline"
                      >
                        Edit pricing ↗
                      </a>
                    )}
                  </nav>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
          </main>

          <footer className="border-t border-mist-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-mist-400 sm:text-sm">
              <p>
                © {new Date().getFullYear()} David Crymble &amp; Sons Funeral Directors.
              </p>
              <p className="mt-1">
                This tool provides an estimate only. It is not a confirmed funeral contract.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
