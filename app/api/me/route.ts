import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readAnySession, SESSION_COOKIE } from "@/lib/auth";

export async function GET() {
  const session = await readAnySession((n) => cookies().get(n)?.value);
  if (!session) return NextResponse.json({ name: null });
  return NextResponse.json({ name: session.name });
}
