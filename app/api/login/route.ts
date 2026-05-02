import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifyCredentials,
} from "@/lib/auth";

export async function POST(req: Request) {
  let name = "";
  let password = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!name || !password) {
    return NextResponse.json({ error: "Name and password required" }, { status: 400 });
  }

  const ok = await verifyCredentials(name, password);
  if (!ok) {
    // Slight delay to disincentivise brute forcing.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Incorrect name or password" }, { status: 401 });
  }

  const token = await createSessionToken(name);
  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
