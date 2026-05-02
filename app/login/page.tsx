import { listUserNames } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const users = await listUserNames();
  const fromPath = searchParams.from && searchParams.from.startsWith("/") ? searchParams.from : "/";

  return (
    <div className="min-h-screen bg-navy-600">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10">
        <div className="text-center">
          <h1 className="heading-serif text-3xl text-white sm:text-4xl">
            David Crymble &amp; Sons
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gold-300">
            Funeral Directors
          </p>
        </div>

        <div className="my-auto rounded-2xl bg-white p-6 shadow-soft sm:p-8">
          <h2 className="heading-serif text-2xl text-navy-900">Staff sign in</h2>
          <p className="mt-1 text-sm text-mist-400">
            Sign in to use the pre-arrangement estimate tool.
          </p>

          {users.length === 0 ? (
            <div className="mt-5 rounded-lg border border-gold-200 bg-gold-50 p-4 text-sm text-gold-900">
              <p className="font-semibold">No users configured</p>
              <p className="mt-1">
                Set the <code className="font-mono">USERS_JSON</code> environment
                variable in <code className="font-mono">.env.local</code> (and on Vercel)
                with hashed credentials. See{" "}
                <code className="font-mono">scripts/hash-password.mjs</code> for how to
                generate hashes.
              </p>
            </div>
          ) : (
            <LoginForm users={users} redirectTo={fromPath} />
          )}
        </div>

        <p className="mt-6 text-center text-xs text-mist-100/60">
          Authorised personnel only.
        </p>
      </div>
    </div>
  );
}
