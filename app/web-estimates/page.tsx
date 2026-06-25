"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDraft } from "@/lib/draft";
import { webEstimateToFormState, type WebEstimate } from "@/lib/webEstimates";

export default function WebEstimatesPage() {
  const [leads, setLeads] = useState<WebEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/web-estimates")
      .then((r) => r.json())
      .then((j) => setLeads(j.leads || []))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, []);

  function open(e: WebEstimate) {
    setOpening(e.id);
    saveDraft(webEstimateToFormState(e)); // wizard (app/new) loads this on open
    fetch("/api/web-estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: e.id, status: "reviewing" }),
    }).catch(() => {});
    router.push("/new");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Web estimates</h1>
      <p className="mt-1 text-sm text-gray-600">
        Estimates families submitted on the website. Open one to continue it as a full quotation.
      </p>

      {loading ? (
        <p className="mt-8 text-gray-500">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          No new web estimates. New requests appear here automatically.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {leads.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{e.name || "(no name)"}</p>
                <p className="truncate text-sm text-gray-600">
                  {e.funeral_type || "Funeral"} · {e.council || e.postcode || ""} · guide {e.total}
                </p>
                <p className="text-xs text-gray-400">
                  {e.email} {e.phone ? "· " + e.phone : ""} · {(e.created || "").slice(0, 16).replace("T", " ")}
                </p>
              </div>
              <button
                onClick={() => open(e)}
                disabled={opening === e.id}
                className="ml-4 shrink-0 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {opening === e.id ? "Opening…" : "Open in planner"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
