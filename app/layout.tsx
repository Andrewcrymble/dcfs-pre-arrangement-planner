import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pre-Arranged Funeral Estimate Tool — David Crymble & Sons",
  description:
    "A guided way to explore pre-arranged funeral options and receive a personalised estimate from David Crymble & Sons Funeral Directors.",
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
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
              <div>
                <p className="heading-serif text-2xl leading-tight sm:text-3xl">
                  David Crymble &amp; Sons
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-gold-300 sm:text-sm">
                  Funeral Directors
                </p>
              </div>
              <div className="hidden text-right text-sm text-mist-100 sm:block">
                <p>Woodstock Road · Finaghy</p>
                <p className="text-gold-300">
                  {process.env.NEXT_PUBLIC_BUSINESS_PHONE || "028 9066 7784"}
                </p>
                {session && (
                  <p className="mt-1 text-xs text-mist-100/80">
                    Signed in as <span className="font-semibold">{session.name}</span>
                    {" · "}
                    <SignOutButton />
                  </p>
                )}
                {session && (
                  <p className="mt-1 flex flex-wrap justify-end gap-x-3 text-xs text-mist-100/80">
                    <a href="/" className="underline-offset-2 hover:text-white hover:underline">
                      New estimate
                    </a>
                    <a
                      href="/dashboard"
                      className="underline-offset-2 hover:text-white hover:underline"
                    >
                      Dashboard
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
                  </p>
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
