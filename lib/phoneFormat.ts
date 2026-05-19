// Google Sheets aggressively interprets pure-digit strings as numbers,
// which drops the leading 0 from UK mobile numbers ("07891..." becomes
// 7891...). Prefixing the value with an apostrophe before writing
// tells Sheets to keep it as text — the apostrophe is stripped on
// display and on subsequent Apps Script reads.
//
// Used by /api/upload-pdf and /api/bookings before forwarding the
// customer block to the Apps Script.

export function normalizePhoneForSheet(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  // Only prepend if the value starts with something Sheets would treat
  // as numeric (a digit, "+", or "(") AND doesn't already have the
  // text-marker apostrophe.
  if (s.startsWith("'")) return s;
  if (/^[\d+(]/.test(s)) return "'" + s;
  return s;
}
