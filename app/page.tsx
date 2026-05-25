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
  "Quoted Date"?: string;
  "PDF URL": string;
}

interface MsStatus {
  configured: boolean;
  connected: boolean;
  user: string | null;
}

const STATUS_QUOTED = "Quoted";
const STATUS_APPOINTMENT = "Appointment";
const STATUS_SENT_TO_WG = "Sent to WG";
const STATUS_DRAFT = "Draft";

// Combine a YYYY-MM-DD and HH:MM into an ISO string with no timezone — the
// /api/microsoft/event endpoint adds the Europe/London timezone server-side.
function combineDateTime(date: string, time: string): string {
  if (!date) return "";
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "10:00";
  return `${date}T${t}:00`;
}

function addMinutesIso(iso: string, minutes: number): string {
  if (!iso) return iso;
  // We deliberately treat the input as a local-time ISO (YYYY-MM-DDTHH:MM:SS)
  // and return one of the same shape — Date#toISOString() converts to UTC
  // which would corrupt the time when we tell Microsoft Graph the timezone
  // is Europe/London. So parse the parts manually.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return iso;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0),
  );
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

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

// Appointment values can be "YYYY-MM-DD HH:MM" (from the booking form) or
// just "DD/MM/YYYY" (from the wizard prompt). Show the time when present.
function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) {
      const datePart = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      return `${datePart} · ${m[4]}:${m[5]}`;
    }
  }
  return formatDate(value);
}

export default function DashboardPage() {
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [updatingRef, setUpdatingRef] = useState<string | null>(null);
  const [msStatus, setMsStatus] = useState<MsStatus | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Booking form
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bFullName, setBFullName] = useState("");
  const [bPhone, setBPhone] = useState("");
  const [bEmail, setBEmail] = useState("");
  const [bBranch, setBBranch] = useState("");
  const [bDate, setBDate] = useState("");
  const [bTime, setBTime] = useState("10:00");

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

  const loadMsStatus = async () => {
    try {
      const res = await fetch("/api/microsoft/status", { cache: "no-store" });
      const data = await res.json();
      setMsStatus(data);
    } catch {
      setMsStatus({ configured: false, connected: false, user: null });
    }
  };

  useEffect(() => {
    load();
    loadMsStatus();
    // Surface result of the OAuth callback (set by /api/microsoft/callback)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ms = params.get("ms");
      if (ms === "ok") {
        setToast({ kind: "success", text: "Microsoft Calendar connected." });
        // Clean the URL
        window.history.replaceState({}, "", "/");
      } else if (ms === "error") {
        setToast({
          kind: "error",
          text: `Couldn't connect Microsoft Calendar: ${params.get("ms_detail") || "unknown"}`,
        });
        window.history.replaceState({}, "", "/");
      }
    }
  }, []);

  // Auto-dismiss toast after 6s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const updateStatus = async (
    ref: string,
    patch: {
      status?: string;
      appointmentDate?: string;
      sentToWG?: string;
      quotedDate?: string;
    },
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
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setUpdatingRef(null);
    }
  };

  // Drop a "Follow up funeral Plan" event into the connected Outlook
  // calendar on the date the staff member picks (default = 7 days out,
  // 9am, 30 min). The estimate row carries everything we need —
  // customer, phone, branch, PDF link — so the calendar entry is
  // self-contained when it pops up later.
  const addFollowUp = async (row: EstimateRow) => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    const dd = String(defaultDate.getDate()).padStart(2, "0");
    const mm = String(defaultDate.getMonth() + 1).padStart(2, "0");
    const yy = defaultDate.getFullYear();
    const dateInput = window.prompt(
      "Follow-up date (DD/MM/YYYY)",
      `${dd}/${mm}/${yy}`,
    );
    if (!dateInput) return;
    const parsed = dateInput.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!parsed) {
      setToast({ kind: "error", text: "Date must be DD/MM/YYYY" });
      return;
    }
    const isoDate = `${parsed[3]}-${parsed[2]}-${parsed[1]}`;
    const start = combineDateTime(isoDate, "09:00");
    const end = addMinutesIso(start, 30);
    const subject = `Follow up funeral Plan — ${row.Customer || "customer"}`;
    const bodyHtml =
      `<p>Reference: <b>${row.Ref}</b></p>` +
      `<p>Phone: ${row.Phone || "—"}</p>` +
      `<p>Branch: ${row.Branch || "—"}</p>` +
      (row["PDF URL"]
        ? `<p>PDF: <a href="${row["PDF URL"]}">${row["PDF URL"]}</a></p>`
        : "");
    setUpdatingRef(row.Ref);
    try {
      const res = await fetch("/api/microsoft/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, start, end, bodyHtml }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setToast({
        kind: "success",
        text: `Follow-up added to Outlook · ${dateInput}`,
      });
    } catch (err) {
      setToast({
        kind: "error",
        text:
          "Couldn't add follow-up — " +
          (err instanceof Error ? err.message : "unknown error"),
      });
    } finally {
      setUpdatingRef(null);
    }
  };

  const deleteRecord = async (ref: string, customer: string) => {
    if (!window.confirm(
      `Delete record for "${customer || ref}"? This removes it from the dashboard and the spreadsheet permanently. The PDF in Drive is NOT deleted.`,
    )) {
      return;
    }
    setUpdatingRef(ref);
    try {
      const res = await fetch(`/api/estimates?ref=${encodeURIComponent(ref)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setToast({ kind: "success", text: `Deleted ${ref}` });
      await load();
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
    } finally {
      setUpdatingRef(null);
    }
  };

  const submitBooking = async () => {
    if (bookingBusy) return;
    if (!bFullName.trim() || !bDate) {
      setToast({ kind: "error", text: "Customer name and date are required." });
      return;
    }
    setBookingBusy(true);
    try {
      const customer = {
        fullName: bFullName.trim(),
        telephone: bPhone.trim(),
        email: bEmail.trim(),
        branch: bBranch,
      };
      const apptDateTime = combineDateTime(bDate, bTime);
      const apptDateLabel = `${bDate} ${bTime}`;
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer, appointmentDate: apptDateLabel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // Best-effort: create a matching Outlook event if MS is connected
      let calMsg = "";
      if (msStatus?.connected) {
        try {
          const start = apptDateTime;
          const end = addMinutesIso(apptDateTime, 30);
          const subject = `Pre-arrangement appointment — ${bFullName.trim()}`;
          const bodyHtml =
            `<p>Reference: <b>${data.ref}</b></p>` +
            `<p>Phone: ${bPhone || "—"}</p>` +
            `<p>Email: ${bEmail || "—"}</p>` +
            `<p>Branch: ${bBranch || "—"}</p>`;
          const evRes = await fetch("/api/microsoft/event", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              subject,
              start,
              end,
              location: bBranch || undefined,
              bodyHtml,
            }),
          });
          if (!evRes.ok) {
            const evData = await evRes.json().catch(() => ({}));
            calMsg = ` (Outlook: ${evData?.error || "failed"})`;
          } else {
            calMsg = " · added to Outlook";
          }
        } catch (err) {
          calMsg = ` (Outlook: ${err instanceof Error ? err.message : "failed"})`;
        }
      }

      setToast({ kind: "success", text: `Booking saved · Ref ${data.ref}${calMsg}` });
      // Reset + close
      setBFullName("");
      setBPhone("");
      setBEmail("");
      setBBranch("");
      setBDate("");
      setBTime("10:00");
      setBookingOpen(false);
      await load();
    } catch (err) {
      setToast({ kind: "error", text: err instanceof Error ? err.message : "Booking failed" });
    } finally {
      setBookingBusy(false);
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
    const drafts: EstimateRow[] = [];
    const quoted: EstimateRow[] = [];
    const appts: EstimateRow[] = [];
    const sent: EstimateRow[] = [];
    for (const e of filtered) {
      const s = (e.Status || "").trim();
      if (s === STATUS_DRAFT) drafts.push(e);
      else if (s === STATUS_SENT_TO_WG) sent.push(e);
      else if (s === STATUS_APPOINTMENT) appts.push(e);
      else quoted.push(e);
    }
    // Sort newest first within each column
    drafts.sort((a, b) => (a.Created < b.Created ? 1 : -1));
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
    return { drafts, quoted, appts, sent };
  }, [filtered]);

  const Card = ({ row }: { row: EstimateRow }) => {
    const isUpdating = updatingRef === row.Ref;
    const status = (row.Status || "").trim();
    const isDraft = status === STATUS_DRAFT;
    return (
      <Link
        href={`/new?ref=${encodeURIComponent(row.Ref)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`block cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:border-navy-400 hover:shadow-soft ${
          isDraft
            ? "border-gold-300 bg-gold-50/40"
            : "border-mist-200"
        }`}
      >
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
              {formatDateTime(row["Appointment Date"])}
            </div>
          )}
          {row["Quoted Date"] && (
            <div>
              <span className="text-mist-400">Quote sent:</span>{" "}
              {formatDate(row["Quoted Date"])}
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
          {isDraft && (
            <span className="rounded-md bg-gold-200 px-2.5 py-1 text-xs font-medium text-navy-900">
              Resume draft →
            </span>
          )}
          {!isDraft && row["PDF URL"] && (
            <a
              href={row["PDF URL"]}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-navy-700 underline-offset-2 hover:underline"
            >
              View PDF ↗
            </a>
          )}
          {!isDraft && status !== STATUS_APPOINTMENT && status !== STATUS_SENT_TO_WG && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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
          {!isDraft && status === STATUS_APPOINTMENT && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const date = window.prompt(
                  "Date quote was sent (DD/MM/YYYY)",
                  new Date().toLocaleDateString("en-GB"),
                );
                if (!date) return;
                updateStatus(row.Ref, {
                  status: STATUS_QUOTED,
                  quotedDate: date,
                });
              }}
              className="rounded-md bg-navy-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-navy-700 disabled:opacity-50"
            >
              Mark quoted
            </button>
          )}
          {!isDraft && status !== STATUS_SENT_TO_WG && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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
          {!isDraft && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addFollowUp(row);
              }}
              className="rounded-md border border-navy-200 bg-white px-2.5 py-1 text-xs font-medium text-navy-800 transition hover:bg-navy-50 disabled:opacity-50"
            >
              Follow up
            </button>
          )}
          {(status === STATUS_APPOINTMENT || status === STATUS_SENT_TO_WG) && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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
          <button
            type="button"
            disabled={isUpdating}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteRecord(row.Ref, row.Customer || "");
            }}
            className="ml-auto text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
            aria-label="Delete record"
            title="Delete record"
          >
            Delete
          </button>
        </div>
      </Link>
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setBookingOpen((v) => !v)}
          >
            {bookingOpen ? "Close booking" : "+ Book appointment"}
          </button>
          <Link href="/new" className="btn-secondary">
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

      {/* Microsoft Calendar status banner */}
      {msStatus?.configured && !msStatus.connected && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-gold-200 bg-gold-50 p-4 text-sm text-gold-900 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Microsoft Calendar isn't connected yet — appointments won't appear in your Outlook automatically.
          </p>
          <a
            href="/api/microsoft/auth"
            className="rounded-md bg-navy-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700"
          >
            Connect Microsoft Calendar
          </a>
        </div>
      )}
      {msStatus?.connected && (
        <p className="mb-4 text-xs text-mist-400">
          Microsoft Calendar connected{msStatus.user ? ` as ${msStatus.user}` : ""}.
          New bookings will appear in Outlook automatically.{" "}
          <a href="/api/microsoft/auth" className="underline-offset-2 hover:underline">
            Reconnect
          </a>
        </p>
      )}

      {/* Booking form (collapsible) */}
      {bookingOpen && (
        <div className="mb-5 rounded-xl bg-white p-5 shadow-soft">
          <h2 className="heading-serif text-xl text-navy-900">Book a customer appointment</h2>
          <p className="mt-1 text-sm text-mist-400">
            For phone bookings — captures the customer details and the appointment time.
            When they come in, click the card to open the wizard pre-filled with their info.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="field-label">Customer name *</label>
              <input
                className="field-input"
                value={bFullName}
                onChange={(e) => setBFullName(e.target.value)}
                placeholder="Mr Robin Gibson"
              />
            </div>
            <div>
              <label className="field-label">Telephone</label>
              <input
                className="field-input"
                value={bPhone}
                onChange={(e) => setBPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                value={bEmail}
                onChange={(e) => setBEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Branch</label>
              <select
                className="field-input"
                value={bBranch}
                onChange={(e) => setBBranch(e.target.value)}
              >
                <option value="">— choose —</option>
                <option value="Woodstock Road">Woodstock Road</option>
                <option value="Finaghy">Finaghy</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Date *</label>
                <input
                  className="field-input"
                  type="date"
                  value={bDate}
                  onChange={(e) => setBDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Time</label>
                <input
                  className="field-input"
                  type="time"
                  value={bTime}
                  onChange={(e) => setBTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setBookingOpen(false)}
              disabled={bookingBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={submitBooking}
              disabled={bookingBusy || !bFullName.trim() || !bDate}
            >
              {bookingBusy ? "Saving…" : "Save booking"}
            </button>
          </div>
        </div>
      )}

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
        <div
          className={`grid grid-cols-1 gap-5 ${
            cols.drafts.length > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          {cols.drafts.length > 0 && (
            <Column title="Drafts" rows={cols.drafts} accent="text-gold-800" />
          )}
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

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.kind === "success"
              ? "bg-navy-700 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
