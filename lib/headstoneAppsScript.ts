// Server-side helper used by every /api/headstones/* route. The browser
// only ever talks to those routes; the upstream Apps Script URL stays in
// env vars. The headstone Apps Script's doPost is `action`-dispatched
// and its doGet handles the orders list + `action=getProofData`.

type AppsScriptResponse = {
  data?: unknown;
  error?: string;
  status: number;
};

function urlAndOpts(): { url: string | null; error?: string } {
  const url = process.env.HEADSTONE_APPS_SCRIPT_URL;
  if (!url) return { url: null, error: "Headstone tracker is not configured" };
  return { url };
}

// POST to the headstone Apps Script with an action + payload. The Apps
// Script responds with `{ success, message, data? }`; we re-shape that
// into the same `{ data, error, status }` envelope used by the
// /api/estimates helper so route handlers stay consistent.
export async function callHeadstoneAction(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<AppsScriptResponse> {
  const { url, error } = urlAndOpts();
  if (error || !url) return { error, status: 503 };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, status: 502 };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `Non-JSON response: ${text.slice(0, 200)}`, status: 502 };
    }
    if (
      data &&
      typeof data === "object" &&
      "success" in data &&
      !(data as { success: boolean }).success
    ) {
      const msg = (data as { message?: string }).message;
      return { error: msg || "Headstone tracker returned an error", status: 502 };
    }
    return { data, status: 200 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "request failed", status: 500 };
  }
}

// GET the orders list + price book. Returns the raw `{ orders, priceBook }`.
export async function fetchHeadstoneIndex(): Promise<AppsScriptResponse> {
  const { url, error } = urlAndOpts();
  if (error || !url) return { error, status: 503 };
  try {
    const resp = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, status: 502 };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `Non-JSON response: ${text.slice(0, 200)}`, status: 502 };
    }
    if (
      data &&
      typeof data === "object" &&
      "success" in data &&
      !(data as { success: boolean }).success
    ) {
      const msg = (data as { message?: string }).message;
      return { error: msg || "Headstone tracker returned an error", status: 502 };
    }
    return { data, status: 200 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "request failed", status: 500 };
  }
}

// GET the customer-facing proof payload by order id. The Apps Script's
// doGet handles this case with `?action=getProofData&id=<orderId>`.
export async function fetchProofData(orderId: string): Promise<AppsScriptResponse> {
  const { url, error } = urlAndOpts();
  if (error || !url) return { error, status: 503 };
  try {
    const u = `${url}?action=getProofData&id=${encodeURIComponent(orderId)}`;
    const resp = await fetch(u, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, status: 502 };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `Non-JSON response: ${text.slice(0, 200)}`, status: 502 };
    }
    if (
      data &&
      typeof data === "object" &&
      "success" in data &&
      !(data as { success: boolean }).success
    ) {
      const msg = (data as { message?: string }).message;
      return { error: msg || "Headstone tracker returned an error", status: 502 };
    }
    return { data, status: 200 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "request failed", status: 500 };
  }
}
