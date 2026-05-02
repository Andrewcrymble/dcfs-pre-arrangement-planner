import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export interface AuthUser {
  name: string;
  passwordHash: string;
}

export interface SessionPayload {
  name: string;
  iat: number;
  exp: number;
}

export const SESSION_COOKIE = "dcfs_session";
const SESSION_TTL_HOURS = 8;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET environment variable is missing or too short (need >= 32 chars).",
    );
  }
  return new TextEncoder().encode(secret);
}

export function getUsers(): AuthUser[] {
  const raw = process.env.USERS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is AuthUser =>
        typeof u?.name === "string" && typeof u?.passwordHash === "string",
    );
  } catch {
    return [];
  }
}

export function listUserNames(): string[] {
  return getUsers().map((u) => u.name);
}

export async function verifyCredentials(
  name: string,
  password: string,
): Promise<boolean> {
  const users = getUsers();
  const user = users.find((u) => u.name === name);
  if (!user) {
    // Run a dummy compare so timing doesn't reveal whether the user exists.
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidi");
    return false;
  }
  return bcrypt.compare(password, user.passwordHash);
}

export async function createSessionToken(name: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_HOURS * 60 * 60;
  return new SignJWT({ name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (typeof payload.name !== "string") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 60 * 60;
