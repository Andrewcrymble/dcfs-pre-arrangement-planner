"use client";

import { useState } from "react";

// Stand-alone postcode → council lookup pinned in the dashboard
// header. Same data source as PostcodeCouncil (postcodes.io) but
// driven by a free-text input the arranger can hit from any page.
// Useful when a customer is on the phone and you just need to know
// quickly which council district they live in.

function formatPostcode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 5) return cleaned;
  return cleaned.slice(0, cleaned.length - 3) + " " + cleaned.slice(-3);
}

export default function PostcodeQuickLookup() {
  const [postcode, setPostcode] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = formatPostcode(postcode);
    if (!formatted) return;
    setBusy(true);
    setResult("");
    setError("");
    try {
      const resp = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(formatted)}`,
      );
      if (resp.status === 404) {
        setError(`Couldn't find ${formatted}`);
        return;
      }
      if (!resp.ok) {
        setError(`HTTP ${resp.status}`);
        return;
      }
      const data = await resp.json();
      const district = data?.result?.admin_district as string | undefined;
      if (!district) {
        setError("No council in response");
        return;
      }
      setResult(`${formatted} → ${district} resident`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "lookup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={lookup}
      className="flex flex-wrap items-center gap-2 text-sm"
      role="search"
      aria-label="Postcode lookup"
    >
      <label className="text-xs uppercase tracking-wider text-gold-300">
        Postcode lookup
      </label>
      <input
        type="search"
        value={postcode}
        onChange={(e) => setPostcode(e.target.value)}
        placeholder="e.g. BT13 1AA"
        autoComplete="postal-code"
        className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-mist-100/50 outline-none focus:border-gold-300 sm:w-[160px]"
      />
      <button
        type="submit"
        disabled={busy || !postcode.trim()}
        className="rounded-md bg-gold-300 px-3 py-1 text-xs font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-50"
      >
        {busy ? "…" : "Check"}
      </button>
      {result && (
        <span className="text-sm">
          <span className="font-semibold text-white">{result}</span>
        </span>
      )}
      {error && <span className="text-sm text-red-300">{error}</span>}
    </form>
  );
}
