"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface EstimateRow {
  Ref: string;
  Created: string;
  Customer: string;
  Phone: string;
  Email: string;
  Branch: string;
  Person: string;
  Relationship: string;
  Total: number | string;
  Status: string;
  "Appointment Date": string;
  "Sent to WG": string;
  "PDF URL": string;
}

const STATUS_QUOTED = "Quoted";
const STATUS_APPOINTMENT = "Appointment";
const STATUS_SENT_TO_WG = "Sent to WG";

function formatGBP(n: number | string): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!isFinite(num)) return String(n);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [updatingRef, setUpdatingRef] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/estimates", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEstimates(Array.isArray(data?.estimates) ? data.estimates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load estimates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (
    ref: string,
    patch: { status?: string; appointmentDate?: string; sentToWG?: string },
  ) => {
    setUpdatingRef(ref);
    try {
      const res = await fetch("/api/estimates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingRef(null);
    }
  };

  const branches = useMemo(() => {
    const set = new Set<string>();
    for (const e of estimates) if (e.Branch) set.add(e.Branch);
    return Array.from(set).sort();
  }, [estimates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return estimates.filter((e) => {
      if (branchFilter && e.Branch !== branchFilter) return false;
      if (q) {
        const haystack = [e.Ref, e.Customer, e.Phone, e.Email, e.Person]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [estimates, search, branchFilter]);

  const cols = useMemo(() => {
    const quoted: EstimateRow[] = [];
    const appts: EstimateRow[] = [];
    const sent: EstimateRow[] = [];
    for (const e of filtered) {
      const s = (e.Status || "").trim();
      if (s === STATUS_SENT_TO_WG) sent.push(e);
      else if (s === STATUS_APPOINTMENT) appts.push(e);
      else quoted.push(e);
    }
    // Sort newest first within each column
    quoted.sort((a, b) => (a.Created < b.Created ? 1 : -1));
    appts.sort(
      (a, b) =>
        (a["Appointment Date"] || a.Created) <
        (b["Appointment Date"] || b.Created)
          ? 1
          : -1,
    );
    sent.sort(
      (a, b) =>
        (a["Sent to WG"] || a.Created) < (b["Sent to WG"] || b.Created) ? 1 : -1,
    );
    return { quoted, appts, sent };
  }, [filtered]);

  const Card = ({ row }: { row: EstimateRow }) => {
    const isUpdating = updatingRef === row.Ref;
    const status = (row.Status || "").trim();
    return (
      <div className="rounded-xl border border-mist-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy-900">
              {row.Customer || "(no name)"}
            </p>
            <p className="font-mono text-xs text-mist-400">{row.Ref}</p>
          </div>
          <span className="whitespace-nowrap text-sm font-semibold text-navy-700">
            {formatGBP(row.Total)}
          </span>
        </div>
        <dl className="mt-2 space-y-0.5 text-xs text-navy-800">
          {row.Branch && (
            <div>
              <span className="text-mist-400">Branch:</span> {row.Branch}
            </div>
          )}
          {row.Phone && (
            <div>
              <span className="text-mist-400">Phone:</span> {row.Phone}
            </div>
          )}
          {row.Person && (
            <div>
              <span className="text-mist-400">For:</span> {row.Person}
              {row.Relationship ? ` (${row.Relationship})` : ""}
            </div>
          )}
          <div>
            <span className="text-mist-400">Created:</span>{" "}
            {formatDate(row.Created)}
          </div>
          {row["Appointment Date"] && (
            <div>
              <span className="text-mist-400">Appointment:</span>{" "}
              {formatDate(row["Appointment Date"])}
            </div>
          )}
          {row["Sent to WG"] && (
            <div>
              <span className="text-mist-400">Sent to WG:</span>{" "}
              {formatDate(row["Sent to WG"])}
            </div>
          )}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {row["PDF URL"] && (
            <a
              href={row["PDF URL"]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-navy-700 underline-offset-2 hover:underline"
            >
              View PDF ↗
            </a>
          )}
          {status !== STATUS_APPOINTMENT && status !== STATUS_SENT_TO_WG && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => {
                const date = window.prompt(
                  "Appointment date (DD/MM/YYYY)",
                  new Date().toLocaleDateString("en-GB"),
                );
                if (!date) return;
                updateStatus(row.Ref, {
                  status: STATUS_APPOINTMENT,
                  appointmentDate: date,
                });
              }}
              className="rounded-md bg-navy-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-navy-700 disabled:opacity-50"
            >
              Book appointment
            </button>
          )}
          {status !== STATUS_SENT_TO_WG && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => {
                const date = window.prompt(
                  "Sent-to-With-Grace date (DD/MM/YYYY)",
                  new Date().toLocaleDateString("en-GB"),
                );
                if (!date) return;
                updateStatus(row.Ref, {
                  status: STATUS_SENT_TO_WG,
                  sentToWG: date,
                });
              }}
              className="rounded-md border border-navy-200 bg-white px-2.5 py-1 text-xs font-medium text-navy-800 transition hover:bg-navy-50 disabled:opacity-50"
            >
              Mark sent to WG
            </button>
          )}
          {(status === STATUS_APPOINTMENT || status === STATUS_SENT_TO_WG) && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => {
                if (!window.confirm("Move this estimate back to Quoted?")) return;
                updateStatus(row.Ref, {
                  status: STATUS_QUOTED,
                  appointmentDate: "",
                  sentToWG: "",
                });
              }}
              className="text-xs text-mist-400 hover:text-navy-700"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    );
  };

  const Column = ({
    title,
    rows,
    accent,
  }: {
    title: string;
    rows: EstimateRow[];
    accent: string;
  }) => (
    <section className="flex flex-col">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className={`heading-serif text-xl ${accent}`}>{title}</h2>
        <span className="text-xs text-mist-400">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-mist-200 bg-white/50 p-4 text-center text-sm text-mist-400">
          Nothing here yet.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.Ref || r.Created + r.Customer} row={r} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading-serif text-3xl text-navy-900 sm:text-4xl">
            Pre-arrangement dashboard
          </h1>
          <p className="mt-1 text-mist-400 sm:text-lg">
            Every estimate, where it is in the process, and the link to its PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/new" className="btn-primary">
            + New estimate
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 rounded-xl bg-white p-4 shadow-soft sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Search by name, ref, phone…"
          className="field-input flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field-input sm:max-w-[200px]"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading && estimates.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-mist-400 shadow-soft">
          Loading estimates…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Column
            title="Plans quoted"
            rows={cols.quoted}
            accent="text-navy-900"
          />
          <Column
            title="Plan appointments"
            rows={cols.appts}
            accent="text-navy-900"
          />
          <Column
            title="Sent to With Grace"
            rows={cols.sent}
            accent="text-navy-900"
          />
        </div>
      )}
    </div>
  );
}
