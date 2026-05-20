"use client";

import { useState } from "react";

// Small postcode lookup that pre-fills the council district + formatted
// postcode into an address textarea. Built on postcodes.io (free, no
// key) — which does NOT return street names, so the arranger still types
// the house number and street themselves. The component just spares them
// retyping the bottom line of every address.

const POSTCODE_OUTER_INNER = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;

function formatPostcode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 5) return cleaned;
  return cleaned.slice(0, cleaned.length - 3) + " " + cleaned.slice(-3);
}

export default function PostcodeAddressFill({
  address,
  onAddressChange,
  onCouncilChange,
}: {
  address: string;
  onAddressChange: (newAddress: string) => void;
  onCouncilChange?: (district: string) => void;
}) {
  const [postcode, setPostcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = formatPostcode(postcode);
    if (!POSTCODE_OUTER_INNER.test(formatted)) {
      setMessage({ kind: "error", text: "That doesn't look like a UK postcode" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const resp = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(formatted)}`,
      );
      if (resp.status === 404) {
        setMessage({ kind: "error", text: `Couldn't find ${formatted}` });
        return;
      }
      if (!resp.ok) {
        setMessage({ kind: "error", text: `Lookup failed (HTTP ${resp.status})` });
        return;
      }
      const data = await resp.json();
      const district = (data?.result?.admin_district as string) || "";
      const parish = (data?.result?.parish as string) || "";
      const area = district || parish || "";
      const tail = area ? `${area}, ${formatted}` : formatted;

      // De-dupe: if the textarea already contains this postcode (any
      // spacing), skip the rewrite but still surface the council so the
      // arranger sees confirmation.
      const haystack = address.toUpperCase().replace(/\s+/g, "");
      const needle = formatted.replace(/\s+/g, "");
      if (haystack.includes(needle)) {
        if (district) onCouncilChange?.(district);
        setMessage({
          kind: "ok",
          text: `${formatted} is already in the address (${area || "no district"})`,
        });
        setPostcode("");
        return;
      }

      const trimmed = address.trim();
      const next = trimmed ? `${trimmed}\n${tail}` : tail;
      onAddressChange(next);
      if (district) onCouncilChange?.(district);
      setMessage({
        kind: "ok",
        text: area
          ? `Added "${area}, ${formatted}" — now type the house number and street above`
          : `Added ${formatted} — now type the house number and street above`,
      });
      setPostcode("");
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Lookup failed",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2">
      <form onSubmit={lookup} className="flex items-end gap-2">
        <div className="flex-1">
          <label className="field-label">Postcode lookup</label>
          <input
            type="text"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            placeholder="e.g. BT13 1AA"
            autoComplete="postal-code"
            className="field-input"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !postcode.trim()}
          className="rounded-lg border border-navy-200 bg-white px-4 py-3 text-sm font-medium text-navy-900 transition hover:border-navy-400 hover:bg-mist-50 disabled:opacity-50"
        >
          {busy ? "Looking up…" : "Use postcode"}
        </button>
      </form>
      {message && (
        <p
          className={`mt-1 text-xs ${
            message.kind === "ok" ? "text-navy-700" : "text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
