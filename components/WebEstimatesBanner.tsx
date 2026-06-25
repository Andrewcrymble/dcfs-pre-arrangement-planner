"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDraft } from "@/lib/draft";
import { webEstimateToFormState, type WebEstimate } from "@/lib/webEstimates";

// Prominent dashboard banner for estimates families submitted on the website.
// Hidden entirely when there are none. Refreshes every minute.
export default function WebEstimatesBanner() {
  const [leads, setLeads] = useState<WebEstimate[]>([]);
  const [opening, setOpening] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    let on = true;
    const load = () =>
      fetch("/api/web-estimates")
        .then((r) => r.json())
        .then((j) => {
          if (on) setLeads(j.leads || []);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, []);

  if (!leads.length) return null;

  function open(e: WebEstimate) {
    setOpening(e.id);
    saveDraft(webEstimateToFormState(e));
    fetch("/api/web-estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: e.id, status: "reviewing" }),
    }).catch(() => {});
    router.push("/new");
  }

  return (
    <div className="mb-6 rounded-2xl border border-gold-300 bg-gold-50 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-gold-300 px-2 text-sm font-bold text-navy-900">
          {leads.length}
        </span>
        <h2 className="text-lg font-semibold text-navy-900">
          New estimate{leads.length === 1 ? "" : "s"} from the website
        </h2>
      </div>
      <p className="mt-1 text-sm text-navy-700">
        Families who requested an estimate online. Open one to continue it as a full quotation.
      </p>
      <ul className="mt-3 space-y-2">
        {leads.slice(0, 5).map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-900">{e.name || "(no name)"}</p>
              <p className="truncate text-xs text-mist-400">
                {e.funeral_type} · {e.council || e.postcode} · guide {e.total}
              </p>
            </div>
            <button
              onClick={() => open(e)}
              disabled={opening === e.id}
              className="shrink-0 rounded-lg bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              {opening === e.id ? "Opening…" : "Open in planner"}
            </button>
          </li>
        ))}
      </ul>
      {leads.length > 5 && (
        <a
          href="/web-estimates"
          className="mt-3 inline-block text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
        >
          View all {leads.length} →
        </a>
      )}
    </div>
  );
}
