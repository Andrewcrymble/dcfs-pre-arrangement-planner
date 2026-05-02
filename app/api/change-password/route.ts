import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readSessionToken,
  setPassword,
  verifyCredentials,
  SESSION_COOKIE,
} from "@/lib/auth";

export async function POST(req: Request) {
  // Identify the caller from their session cookie. Middleware already
  // gates this route to authenticated users, but verify defensively here
  // so a stale or forged cookie can't change a password.
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json(
      { error: "currentPassword and newPassword required" },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must differ from the current one" },
      { status: 400 },
    );
  }

  const ok = await verifyCredentials(session.name, currentPassword);
  if (!ok) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 403 },
    );
  }

  try {
    await setPassword(session.name, newPassword);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not save the new password",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
