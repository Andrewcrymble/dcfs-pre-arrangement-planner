// Read/write a key/value setting in the Apps Script-backed Settings sheet.
// Used for things that have to persist across deploys but don't belong in
// env vars (e.g. the rotating Microsoft refresh token).

async function callAppsScript(action: string, extra: Record<string, unknown>): Promise<unknown> {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) {
    throw new Error("Apps Script integration is not configured");
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret, action, ...extra }),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Apps Script ${action} HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script ${action} returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(`Apps Script ${action} error: ${String(data.error)}`);
  }
  return data;
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const data = (await callAppsScript("get_setting", { key })) as { value?: string | null };
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await callAppsScript("set_setting", { key, value });
}
