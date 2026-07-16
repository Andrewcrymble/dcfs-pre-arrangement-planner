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
// Hub single sign-on pass — minted by crymbleandsons.com/admin/login for the
// whole .crymbleandsons.com zone. Verified here with the shared HUB_SSO_SECRET,
// so one Hub sign-in covers the planner with no separate login.
export const SSO_COOKIE = "dcfs_sso";
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

// Read users whose passwords have been changed through the UI — stored in
// the Crymble Hub (D1) since 2026-07-16; previously the Google Sheet "Users"
// tab. Falls back gracefully on any error — the env-var users keep working.
async function getSheetUsers(): Promise<AuthUser[]> {
  const secret = process.env.HUB_LETTERS_KEY;
  if (!secret) return [];
  try {
    const resp = await fetch("https://crymbleandsons.com/api/planner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: secret, action: "get_users" }),
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
  const secret = process.env.HUB_LETTERS_KEY;
  if (!secret) {
    throw new Error("Password storage is not configured on the server.");
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const resp = await fetch("https://crymbleandsons.com/api/planner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: secret, action: "set_password", name, passwordHash }),
    cache: "no-store",
    redirect: "follow",
  });
  if (!resp.ok) {
    throw new Error(`Password store update failed: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { ok?: boolean; error?: string };
  if (data.error || !data.ok) {
    throw new Error(data.error || "Password store update failed");
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

// Verify a Hub SSO pass. Returns the same SessionPayload shape as the
// planner's own session so every consumer works unchanged.
export async function readSsoToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const raw = process.env.HUB_SSO_SECRET;
  if (!raw || raw.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(raw), {
      algorithms: ["HS256"],
    });
    const name =
      typeof payload.name === "string" && payload.name
        ? payload.name
        : typeof payload.email === "string"
          ? payload.email
          : "";
    if (!name) return null;
    return {
      name,
      iat: Number(payload.iat) || 0,
      exp: Number(payload.exp) || 0,
    };
  } catch {
    return null;
  }
}

// One call for "who is signed in?" — the planner's own session first, then
// the Hub SSO pass.
export async function readAnySession(
  getCookie: (name: string) => string | undefined,
): Promise<SessionPayload | null> {
  return (
    (await readSessionToken(getCookie(SESSION_COOKIE))) ||
    (await readSsoToken(getCookie(SSO_COOKIE)))
  );
}

export const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 60 * 60;
