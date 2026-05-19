"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Headstone tracker dashboard — list view only (Phase 0). The order
// editor, inscription designer, and proof flow come in later phases.
// Shape comes from mapSheetOrderToTracker in the sibling Apps Script.
interface HeadstoneOrder {
  orderId: string;
  orderRef: string;
  created: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  phone: string;
  email: string;
  deceasedName: string;
  totalSellPrice: number;
  depositPaid: number;
  balanceDue: number;
  proofDate: string;
  artworkApproved: boolean;
  installDate: string;
  archived: boolean;
}

const STATUS_ORDER = [
  "Enquiry",
  "Quoted",
  "Confirmed",
  "In Design",
  "Production",
  "Ready",
  "Installed",
];

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

export default function HeadstonesDashboardPage() {
  const [orders, setOrders] = useState<HeadstoneOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/headstones/orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!showArchived && o.archived) return false;
      if (q) {
        const haystack = [
          o.orderRef,
          o.customerName,
          o.deceasedName,
          o.phone,
          o.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, showArchived]);

  // Bucket by status, in the canonical pipeline order. Anything with an
  // unrecognised status falls into the first bucket so we don't lose it.
  const buckets = useMemo(() => {
    const map = new Map<string, HeadstoneOrder[]>();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const o of filtered) {
      const key = STATUS_ORDER.includes(o.status) ? o.status : STATUS_ORDER[0];
      map.get(key)!.push(o);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.created < b.created ? 1 : -1));
    }
    return map;
  }, [filtered]);

  const Card = ({ row }: { row: HeadstoneOrder }) => (
    <Link
      href={`/headstones/${encodeURIComponent(row.orderId)}`}
      className="block rounded-xl border border-mist-200 bg-white p-4 shadow-sm transition hover:border-navy-400 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy-900">
            {row.deceasedName || row.customerName || "(no name)"}
          </p>
          <p className="font-mono text-xs text-mist-400">
            {(row.orderRef || row.orderId || "").slice(-8).toUpperCase()}
          </p>
        </div>
        <span className="whitespace-nowrap text-sm font-semibold text-navy-700">
          {formatGBP(row.totalSellPrice)}
        </span>
      </div>
      <dl className="mt-2 space-y-0.5 text-xs text-navy-800">
        {row.customerName && row.deceasedName && (
          <div>
            <span className="text-mist-400">Customer:</span> {row.customerName}
          </div>
        )}
        {row.phone && (
          <div>
            <span className="text-mist-400">Phone:</span> {row.phone}
          </div>
        )}
        <div>
          <span className="text-mist-400">Created:</span>{" "}
          {formatDate(row.created)}
        </div>
        {row.paymentStatus && (
          <div>
            <span className="text-mist-400">Payment:</span> {row.paymentStatus}
            {row.balanceDue > 0 ? ` · bal ${formatGBP(row.balanceDue)}` : ""}
          </div>
        )}
        {row.artworkApproved && row.proofDate && (
          <div>
            <span className="text-mist-400">Proof approved:</span>{" "}
            {formatDate(row.proofDate)}
          </div>
        )}
        {row.installDate && (
          <div>
            <span className="text-mist-400">Installed:</span>{" "}
            {formatDate(row.installDate)}
          </div>
        )}
      </dl>
    </Link>
  );

  const Column = ({
    title,
    rows,
  }: {
    title: string;
    rows: HeadstoneOrder[];
  }) => (
    <section className="flex flex-col">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="heading-serif text-xl text-navy-900">{title}</h2>
        <span className="text-xs text-mist-400">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-mist-200 bg-white/50 p-4 text-center text-sm text-mist-400">
          Nothing here yet.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.orderId} row={r} />
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
            Headstone orders
          </h1>
          <p className="mt-1 text-mist-400 sm:text-lg">
            Every memorial order, its place in the pipeline, and a tap-through
            to edit pricing, design and proofs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/headstones/new" className="btn-primary">
            + New order
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
          placeholder="Search by ref, customer, deceased, phone…"
          className="field-input flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-navy-800">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading && orders.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-mist-400 shadow-soft">
          Loading orders…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_ORDER.map((s) => (
            <Column key={s} title={s} rows={buckets.get(s) || []} />
          ))}
        </div>
      )}
    </div>
  );
}
