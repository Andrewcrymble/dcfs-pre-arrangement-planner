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

function getEnvUsers(): AuthUser[] {
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

// Read users that have been written to the Users tab of the pricing
// spreadsheet via Apps Script (i.e. anyone who has changed their password
// through the UI). Falls back gracefully on any error — the env-var users
// keep working.
async function getSheetUsers(): Promise<AuthUser[]> {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) return [];
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, action: "get_users" }),
      cache: "no-store",
      redirect: "follow",
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { users?: AuthUser[]; error?: string };
    if (!Array.isArray(data.users)) return [];
    return data.users.filter(
      (u) => typeof u?.name === "string" && typeof u?.passwordHash === "string",
    );
  } catch {
    return [];
  }
}

// Sheet-defined users override env-defined users with the same name (so once
// someone changes their password, the new hash from the sheet wins).
export async function getUsers(): Promise<AuthUser[]> {
  const [envUsers, sheetUsers] = await Promise.all([
    Promise.resolve(getEnvUsers()),
    getSheetUsers(),
  ]);
  const merged = new Map<string, AuthUser>();
  for (const u of envUsers) merged.set(u.name, u);
  for (const u of sheetUsers) merged.set(u.name, u);
  return Array.from(merged.values());
}

export async function listUserNames(): Promise<string[]> {
  return (await getUsers()).map((u) => u.name);
}

export async function verifyCredentials(
  name: string,
  password: string,
): Promise<boolean> {
  const users = await getUsers();
  const user = users.find((u) => u.name === name);
  if (!user) {
    // Run a dummy compare so timing doesn't reveal whether the user exists.
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidi");
    return false;
  }
  return bcrypt.compare(password, user.passwordHash);
}

// Sets a new password for `name` by writing a fresh bcrypt hash to the
// Users tab via Apps Script. The change takes effect on the next login.
export async function setPassword(
  name: string,
  newPassword: string,
): Promise<void> {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) {
    throw new Error("Password storage is not configured on the server.");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret, action: "set_password", name, passwordHash }),
    cache: "no-store",
    redirect: "follow",
  });
  if (!resp.ok) {
    throw new Error(`Sheet update failed: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { ok?: boolean; error?: string };
  if (data.error || !data.ok) {
    throw new Error(data.error || "Sheet update failed");
  }
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
