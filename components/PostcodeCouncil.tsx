"use client";

import { useEffect, useRef, useState } from "react";

// Pulls a UK postcode out of a free-text address and looks up the
// local authority district via postcodes.io (free, no key, CORS open).
// Used in the wizard's Customer step to show e.g. "Belfast resident"
// under the address textarea, so the arranger knows which council's
// resident rate applies to burial / cremation fees.

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

interface LookupResult {
  district: string;
  // Raw response can include more (country, admin_county, etc.) but
  // for the display we only need the district name.
}

function extractPostcode(address: string): string | null {
  if (!address) return null;
  const m = address.match(POSTCODE_RE);
  if (!m) return null;
  // Normalise spacing to <outer> <inner> (e.g. "BT131AA" -> "BT13 1AA")
  const cleaned = m[1].toUpperCase().replace(/\s+/g, "");
  const inner = cleaned.slice(-3);
  const outer = cleaned.slice(0, cleaned.length - 3);
  return `${outer} ${inner}`;
}

export default function PostcodeCouncil({
  address,
  onCouncilChange,
}: {
  address: string;
  onCouncilChange?: (district: string) => void;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading"; postcode: string }
    | { kind: "ok"; postcode: string; result: LookupResult }
    | { kind: "notfound"; postcode: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Cache so re-typing the same postcode after a backspace doesn't refetch.
  const cache = useRef<Map<string, LookupResult | null>>(new Map());
  const lastReported = useRef<string>("");

  useEffect(() => {
    const postcode = extractPostcode(address);
    if (!postcode) {
      setState({ kind: "idle" });
      if (lastReported.current !== "") {
        lastReported.current = "";
        onCouncilChange?.("");
      }
      return;
    }

    // Cache hit — respond instantly, no fetch.
    if (cache.current.has(postcode)) {
      const hit = cache.current.get(postcode);
      if (hit) {
        setState({ kind: "ok", postcode, result: hit });
        if (lastReported.current !== hit.district) {
          lastReported.current = hit.district;
          onCouncilChange?.(hit.district);
        }
      } else {
        setState({ kind: "notfound", postcode });
        if (lastReported.current !== "") {
          lastReported.current = "";
          onCouncilChange?.("");
        }
      }
      return;
    }

    // Debounce: wait 350ms after the user stops typing before hitting
    // postcodes.io. Cleans up if the postcode changes again.
    const t = setTimeout(async () => {
      setState({ kind: "loading", postcode });
      try {
        const resp = await fetch(
          `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
        );
        if (resp.status === 404) {
          cache.current.set(postcode, null);
          setState({ kind: "notfound", postcode });
          if (lastReported.current !== "") {
            lastReported.current = "";
            onCouncilChange?.("");
          }
          return;
        }
        if (!resp.ok) {
          setState({ kind: "error", message: `HTTP ${resp.status}` });
          return;
        }
        const data = await resp.json();
        const district =
          (data?.result?.admin_district as string) ||
          (data?.result?.parish as string) ||
          "";
        if (!district) {
          cache.current.set(postcode, null);
          setState({ kind: "notfound", postcode });
          return;
        }
        const result: LookupResult = { district };
        cache.current.set(postcode, result);
        setState({ kind: "ok", postcode, result });
        if (lastReported.current !== district) {
          lastReported.current = district;
          onCouncilChange?.(district);
        }
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "lookup failed",
        });
      }
    }, 350);

    return () => clearTimeout(t);
    // We intentionally don't include onCouncilChange in deps — it'd
    // cause refetches when the parent recreates its callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (state.kind === "idle") {
    return (
      <p className="mt-1 text-xs text-mist-400">
        Council district will appear here once a postcode is detected in the
        address.
      </p>
    );
  }

  if (state.kind === "loading") {
    return (
      <p className="mt-1 text-xs text-mist-400">
        Looking up council for {state.postcode}…
      </p>
    );
  }

  if (state.kind === "ok") {
    return (
      <p className="mt-1 text-xs">
        <span className="text-mist-400">Council district:</span>{" "}
        <span className="font-semibold text-navy-900">
          {state.result.district} resident
        </span>
        <span className="text-mist-400"> · from {state.postcode}</span>
      </p>
    );
  }

  if (state.kind === "notfound") {
    return (
      <p className="mt-1 text-xs text-amber-700">
        Couldn&apos;t find a council for {state.postcode}. Double-check the
        postcode.
      </p>
    );
  }

  return (
    <p className="mt-1 text-xs text-red-700">
      Council lookup failed: {state.message}
    </p>
  );
}
