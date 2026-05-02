// Microsoft Graph integration for the appointments calendar.
//
// Auth model: a single user (e.g. Andrew) connects once via OAuth and we
// store the resulting refresh token in the spreadsheet's Settings tab via
// Apps Script. Server-side routes refresh the access token on demand to
// create events on that user's default calendar.

import { getSetting, setSetting } from "@/lib/sheetSettings";

const MS_AUTH_BASE = "https://login.microsoftonline.com";
const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = "Calendars.ReadWrite offline_access";

export const SETTING_REFRESH_TOKEN = "ms_refresh_token";
export const SETTING_CONNECTED_USER = "ms_connected_user";

function tenant(): string {
  return process.env.MS_TENANT_ID || "common";
}

function clientId(): string {
  const v = process.env.MS_CLIENT_ID;
  if (!v) throw new Error("MS_CLIENT_ID not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.MS_CLIENT_SECRET;
  if (!v) throw new Error("MS_CLIENT_SECRET not configured");
  return v;
}

function redirectUri(req: Request): string {
  // Build the absolute callback URL from the incoming request so this
  // works on both the live custom domain and any preview deployments.
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}/api/microsoft/callback`;
}

export function authorizeUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirectUri(req),
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  return `${MS_AUTH_BASE}/${tenant()}/oauth2/v2.0/authorize?${params}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCode(req: Request, code: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    redirect_uri: redirectUri(req),
    grant_type: "authorization_code",
    scope: SCOPES,
  });
  const resp = await fetch(`${MS_AUTH_BASE}/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Token exchange failed: ${resp.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json as TokenSet;
}

export async function refresh(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES,
  });
  const resp = await fetch(`${MS_AUTH_BASE}/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Token refresh failed: ${resp.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json as TokenSet;
}

// Pull a fresh access token using the stored refresh token. Updates the
// stored refresh token if Microsoft rotates it.
export async function getAccessToken(): Promise<string> {
  const stored = await getSetting(SETTING_REFRESH_TOKEN);
  if (!stored) throw new Error("Microsoft Calendar is not connected");
  const tokens = await refresh(stored);
  if (tokens.refresh_token && tokens.refresh_token !== stored) {
    await setSetting(SETTING_REFRESH_TOKEN, tokens.refresh_token);
  }
  return tokens.access_token;
}

export interface CalendarEvent {
  subject: string;
  bodyHtml?: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  location?: string;
  timeZone?: string;
}

export async function createEvent(event: CalendarEvent): Promise<{ id: string; webLink?: string }> {
  const accessToken = await getAccessToken();
  const tz = event.timeZone || "Europe/London";
  const payload = {
    subject: event.subject,
    body: { contentType: "HTML", content: event.bodyHtml || "" },
    start: { dateTime: event.start, timeZone: tz },
    end: { dateTime: event.end, timeZone: tz },
    location: event.location ? { displayName: event.location } : undefined,
  };
  const resp = await fetch(`${MS_GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Graph createEvent failed: ${resp.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return { id: json.id, webLink: json.webLink };
}

export async function whoAmI(accessToken: string): Promise<{ displayName?: string; mail?: string; userPrincipalName?: string }> {
  const resp = await fetch(`${MS_GRAPH_BASE}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!resp.ok) return {};
  return resp.json();
}
