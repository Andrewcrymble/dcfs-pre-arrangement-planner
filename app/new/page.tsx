"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveDraft, loadDraft, clearDraft, timeSince } from "@/lib/draft";
import ProgressBar from "@/components/ProgressBar";
import StepNav from "@/components/StepNav";
import RunningTotal from "@/components/RunningTotal";
import { OptionListMulti, OptionListSingle } from "@/components/OptionList";
import { fetchPricing, formatGBP, itemsByCategory } from "@/lib/sheets";
import {
  buildSelectedLines,
  totalsForLines,
  PDF_DISCLAIMER,
  isDirectFuneralType,
  isBundledForDirect,
  BUNDLED_DISBURSEMENTS_FOR_DIRECT,
  monthlyInstalmentOptions,
  ageInYears,
  maxFinanceMonthsForAge,
  planHolderDob,
  FINANCE_MAX_AGE,
} from "@/lib/estimate";
import { DIRECT_PACKAGE_DISCOUNT_NAME } from "@/lib/types";
import { generateEstimatePdf } from "@/lib/pdf";
import { generateEstimateId } from "@/lib/estimate";
import PostcodeCouncil from "@/components/PostcodeCouncil";
import { councilFee } from "@/lib/charges";
import type {
  ArrangerNote,
  Branch,
  CustomDisbursement,
  CustomDiscount,
  CustomerDetails,
  FormState,
  Person,
  PriceItem,
  Wishes,
} from "@/lib/types";
import { FALLBACK_PRICING } from "@/lib/fallbackPricing";

// Stable keys for each wizard step. The visible label / display order is
// derived from STEP_LABEL_MAP, and a "person" step is conditionally inserted
// when arrangementFor === "Someone else" (see stepKeysFor() below).
type StepKey =
  | "customer"
  | "person"
  | "funeral"
  | "service"
  | "coffin"
  | "transport"
  | "additional"
  | "disbursements"
  | "wishes"
  | "notesForClient"
  | "summary";

const STEP_LABEL_MAP: Record<StepKey, string> = {
  customer: "Your details",
  person: "Person details",
  funeral: "Funeral type",
  service: "Service",
  coffin: "Coffin",
  transport: "Transport",
  additional: "Additional services",
  disbursements: "Disbursements",
  wishes: "Wishes & info",
  notesForClient: "Notes for client",
  summary: "Summary",
};

function stepKeysFor(arrangementFor: string): StepKey[] {
  const base: StepKey[] = [
    "customer",
    "funeral",
    "service",
    "coffin",
    "transport",
    "additional",
    "disbursements",
    "wishes",
    "notesForClient",
    "summary",
  ];
  if (arrangementFor === "Someone else") {
    return ["customer", "person", ...base.slice(1)];
  }
  return base;
}

const EMPTY_PERSON: Person = {
  fullName: "",
  dateOfBirth: "",
  address: "",
  relationship: "",
  doctorName: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  maritalStatus: "",
  occupation: "",
};

const EMPTY_WISHES: Wishes = {
  officiant: "",
  music: "",
  readings: "",
  flowers: "",
  dressCode: "",
  catering: "",
  other: "",
};

const EMPTY_FORM: FormState = {
  customer: {
    fullName: "",
    telephone: "",
    email: "",
    address: "",
    branch: "",
    arrangementFor: "",
    councilDistrict: "",
    dateOfBirth: "",
    maritalStatus: "",
    occupation: "",
  },
  person: EMPTY_PERSON,
  funeralType: "",
  serviceChoice: "",
  coffin: "",
  transport: [],
  additionalServices: [],
  disbursements: [],
  customDisbursements: [],
  customDiscounts: [],
  wishes: EMPTY_WISHES,
  directPackageDiscount: false,
  arrangerNotes: [],
  deposit: 0,
  coverMessage: "",
  notesForClient: "",
  showFinanceOptions: true,
};

// Returns the local-time ISO string (no timezone suffix) for "9am, 7 days
// from now, rolled forward to Monday if it lands on Saturday or Sunday".
// Microsoft Graph applies the Europe/London timezone server-side.
function followUpStartIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function addMinutesIsoLocal(iso: string, minutes: number): string {
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Chunked conversion to avoid stack-overflow on String.fromCharCode(...bytes)
  // for any non-trivial PDF size.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return btoa(binary);
}

function formatNoteTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} · ${time}`;
  } catch {
    return iso;
  }
}

const SERVICE_FALLBACK = FALLBACK_PRICING.filter((i) => i.category === "service_choice");
const FUNERAL_FALLBACK = FALLBACK_PRICING.filter((i) => i.category === "funeral_type");

const TRANSPORT_DEFAULTS = [
  "Hearse only",
  "Hearse + 1 limousine",
  "Hearse + 2 limousines",
  "Additional limousine",
  "Horse-drawn hearse",
  "Other",
];

export default function Home() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Council burial/cremation fee — same logic as the public website. Adds/updates
  // a custom disbursement ("auto-council-fee") whenever funeral type + council change.
  useEffect(() => {
    const ft = form.funeralType;
    const council = form.customer.councilDistrict;
    if (!ft || !council) return;
    const isCremation = /cremation/i.test(ft);
    if (!isCremation && !/burial/i.test(ft)) return;
    let cancelled = false;
    councilFee(council, isCremation, true).then((fee) => {
      if (cancelled) return;
      setForm((f) => {
        const others = f.customDisbursements.filter((d) => d.id !== "auto-council-fee");
        return fee
          ? { ...f, customDisbursements: [...others, { id: "auto-council-fee", label: fee.label, price: fee.amount }] }
          : { ...f, customDisbursements: others };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [form.funeralType, form.customer.councilDistrict]);

  const [pricing, setPricing] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<"sheet" | "fallback">("sheet");
  // When the wizard is opened with ?ref=DCFS-... we treat it as editing an
  // existing record rather than creating a new one. Customer/person info is
  // pre-filled from the Estimates sheet, and the same Ref is reused when the
  // PDF/WhatsApp pipeline runs (Apps Script's upload action upserts on Ref).
  const [editRef, setEditRef] = useState<string | null>(null);

  // ---- Draft persistence ----
  // Form state auto-saves to localStorage so the arranger can close
  // the tab mid-wizard and resume on the same device. Cleared once
  // the final PDF is generated. Skipped entirely when editing an
  // existing estimate (?ref=DCFS-…) — that data comes from the sheet.
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  // Set while the "Save & exit" button is awaiting the dashboard save.
  // Disables the button so a slow network click can't double-fire.
  const [savingAndExiting, setSavingAndExiting] = useState(false);
  const [topToast, setTopToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Background auto-push state. `autoDraftRef` is the Ref the server
  // assigned to this draft on its first push — we hold onto it so every
  // subsequent push upserts the same row instead of duplicating. `lastPushed`
  // is the JSON of the last form snapshot we successfully pushed; we diff
  // against it so identical form state (e.g. user clicking around but not
  // typing) doesn't hit the API needlessly.
  const autoDraftRef = useRef<string | null>(null);
  const lastPushed = useRef<string>("");
  const [autoPushedAt, setAutoPushedAt] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{ savedAt: string } | null>(null);
  const draftChecked = useRef(false);
  // When this wizard is opened as a partner quote (?partner=1&partnerOf=…),
  // the originating ref is stashed here so we can (a) send it with the
  // upload payload — Apps Script writes it to the new row's Partner Ref
  // column — and (b) cross-PATCH the original record so both sides point
  // at each other.
  const [partnerOf, setPartnerOf] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPricing().then((res) => {
      if (cancelled) return;
      setPricing(res.items);
      setSource(res.source);
      setLoadError(res.error || null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // If we land on /new?ref=DCFS-... pre-fill from the existing record.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    setEditRef(ref);
    fetch(`/api/estimates?ref=${encodeURIComponent(ref)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (r) => {
        // Same auth-redirect guard as saveAndExit — if middleware sent us to
        // /login, the JSON parse below would silently fail and the wizard
        // would open blank with no indication of why.
        if (r.redirected && /\/login\b/.test(r.url)) {
          throw new Error("Your session has expired — please log in again");
        }
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          throw new Error("Couldn't load the saved estimate (server returned non-JSON)");
        }
        return r.json();
      })
      .then((data) => {
        const e = data?.estimate;
        if (!e) return;

        // Prefer the full saved snapshot if present — restores every
        // wizard selection (funeral type, coffin, transport, additional
        // services, disbursements, custom charges, wishes). Falls back
        // to summary-only restore for older records that pre-date the
        // Data column.
        const dataRaw = e.Data;
        if (typeof dataRaw === "string" && dataRaw.trim() !== "") {
          try {
            const snap = JSON.parse(dataRaw);
            setForm((prev) => ({
              ...prev,
              customer: { ...prev.customer, ...(snap.customer || {}) },
              person: { ...prev.person, ...(snap.person || {}) },
              funeralType: snap.funeralType ?? prev.funeralType,
              serviceChoice: snap.serviceChoice ?? prev.serviceChoice,
              coffin: snap.coffin ?? prev.coffin,
              transport: Array.isArray(snap.transport) ? snap.transport : prev.transport,
              additionalServices: Array.isArray(snap.additionalServices)
                ? snap.additionalServices
                : prev.additionalServices,
              disbursements: Array.isArray(snap.disbursements)
                ? snap.disbursements
                : prev.disbursements,
              customDisbursements: Array.isArray(snap.customDisbursements)
                ? snap.customDisbursements
                : prev.customDisbursements,
              customDiscounts: Array.isArray(snap.customDiscounts)
                ? snap.customDiscounts
                : prev.customDiscounts,
              wishes: { ...prev.wishes, ...(snap.wishes || {}) },
              directPackageDiscount:
                typeof snap.directPackageDiscount === "boolean"
                  ? snap.directPackageDiscount
                  : prev.directPackageDiscount,
              arrangerNotes: Array.isArray(snap.arrangerNotes)
                ? snap.arrangerNotes
                : prev.arrangerNotes,
              deposit:
                typeof snap.deposit === "number" && Number.isFinite(snap.deposit)
                  ? snap.deposit
                  : prev.deposit,
              coverMessage:
                typeof snap.coverMessage === "string"
                  ? snap.coverMessage
                  : prev.coverMessage,
              notesForClient:
                typeof snap.notesForClient === "string"
                  ? snap.notesForClient
                  : prev.notesForClient,
              showFinanceOptions:
                typeof snap.showFinanceOptions === "boolean"
                  ? snap.showFinanceOptions
                  : prev.showFinanceOptions,
            }));
            return;
          } catch {
            // JSON parse failed — fall through to summary-only restore.
          }
        }

        // Sheet cells come back as their inferred JS type — a phone number
        // "2222" arrives as a JS number, not a string. Coerce defensively
        // so the wizard's .trim() / etc. calls never explode.
        const str = (v: unknown): string => (v == null ? "" : String(v));
        const personName = str(e.Person);
        setForm((prev) => ({
          ...prev,
          customer: {
            ...prev.customer,
            fullName: str(e.Customer) || prev.customer.fullName,
            telephone: str(e.Phone) || prev.customer.telephone,
            email: str(e.Email) || prev.customer.email,
            branch:
              e.Branch === "Woodstock Road" || e.Branch === "Finaghy"
                ? e.Branch
                : prev.customer.branch,
            arrangementFor:
              personName.trim() !== ""
                ? "Someone else"
                : prev.customer.arrangementFor,
          },
          person: personName
            ? {
                ...prev.person,
                fullName: personName,
                relationship: str(e.Relationship),
              }
            : prev.person,
        }));
      })
      .catch((err) => {
        // Surface failures so a session expiry / 502 doesn't manifest as
        // a mysteriously blank wizard. The arranger now sees what went
        // wrong and can re-log-in or refresh rather than thinking the
        // draft is lost.
        setTopToast({
          kind: "error",
          text:
            "Couldn't load this estimate — " +
            (err instanceof Error ? err.message : "unknown error"),
        });
      });
  }, []);

  const lines = useMemo(() => buildSelectedLines(form, pricing), [form, pricing]);
  const totals = useMemo(() => totalsForLines(lines), [lines]);

  const stepKeys = useMemo(
    () => stepKeysFor(form.customer.arrangementFor),
    [form.customer.arrangementFor],
  );
  const stepLabels = useMemo(
    () => stepKeys.map((k) => STEP_LABEL_MAP[k]),
    [stepKeys],
  );
  // Clamp the step index in case the keys list shrank (e.g. user went from
  // "Someone else" back to "Myself" while on the inserted person step).
  const safeStep = Math.min(step, stepKeys.length - 1);
  const stepKey = stepKeys[safeStep];

  // When the step changes, drop the viewport scroll back to the top of the
  // wizard card. Long steps (Wishes, Summary) otherwise leave the user
  // landing halfway down the next screen, which feels disorienting.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepKey]);

  const updateCustomer = (patch: Partial<FormState["customer"]>) =>
    setForm((f) => ({ ...f, customer: { ...f.customer, ...patch } }));
  const updatePerson = (patch: Partial<Person>) =>
    setForm((f) => ({ ...f, person: { ...f.person, ...patch } }));

  // Draft: on first mount when not editing an existing estimate, check
  // localStorage for a saved draft and surface a resume banner.
  useEffect(() => {
    if (draftChecked.current) return;
    if (typeof window === "undefined") return;
    // Wait until we know whether we're editing — editRef is set
    // synchronously from the URL on mount above.
    draftChecked.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("ref")) return; // editing — skip draft

    // Partner-quote flow: arranger clicked "+ Start a second quote for
    // partner" on the summary of another estimate. We carry household
    // contact info via sessionStorage (the originating tab writes it
    // before opening this one), prefill the customer block with it, and
    // skip the resume-draft prompt entirely — this is a fresh sibling
    // quote, not a resume.
    if (params.get("partner") === "1") {
      const originRef = params.get("partnerOf");
      if (originRef) setPartnerOf(originRef);
      try {
        const raw = sessionStorage.getItem("dcfs:partnerHousehold");
        if (raw) {
          const h = JSON.parse(raw) as Partial<CustomerDetails>;
          setForm((f) => ({
            ...f,
            customer: {
              ...f.customer,
              telephone: h.telephone ?? "",
              email: h.email ?? "",
              branch: (h.branch as Branch | "" | undefined) ?? "",
              address: h.address ?? "",
              councilDistrict: h.councilDistrict ?? "",
            },
          }));
        }
        sessionStorage.removeItem("dcfs:partnerHousehold");
      } catch {
        // Bad JSON or storage disabled — fall through to an empty wizard.
      }
      return;
    }

    const draft = loadDraft();
    if (draft) {
      setResumePrompt({ savedAt: draft.savedAt });
    }
  }, []);

  // Draft: auto-save form changes (debounced ~1s). Skipped while the
  // resume prompt is up (user hasn't decided yet) and while editing an
  // existing estimate.
  useEffect(() => {
    if (resumePrompt) return;
    if (editRef) return;
    // Skip the truly-empty initial state — saving an unused empty form
    // would mask any legitimately-stored draft from previous sessions.
    const hasAnyInput =
      form.customer.fullName.trim() !== "" ||
      form.customer.telephone.trim() !== "" ||
      form.customer.email.trim() !== "" ||
      form.customer.address.trim() !== "" ||
      form.funeralType !== "" ||
      form.serviceChoice !== "" ||
      form.coffin !== "";
    if (!hasAnyInput) return;
    const t = setTimeout(() => {
      const rec = saveDraft(form);
      if (rec) setDraftSavedAt(rec.savedAt);
    }, 1000);
    return () => clearTimeout(t);
  }, [form, resumePrompt, editRef]);

  // Server-side auto-push: after meaningful input + 8s idle, push the
  // current form to the dashboard as a Draft row so it appears on the
  // dashboard from any device. Diff-hashed against the last successful
  // push so we don't re-POST on every keystroke. Skipped while the resume
  // prompt is up; for in-place edits (editRef set) the same path also
  // upserts the existing row (save_draft preserves promoted statuses).
  useEffect(() => {
    if (resumePrompt) return;
    // Same "user has done something meaningful" gate as the localStorage
    // auto-save — don't materialise an empty Draft row from a passive visit.
    const hasAnyInput =
      form.customer.fullName.trim() !== "" ||
      form.customer.telephone.trim() !== "" ||
      form.customer.email.trim() !== "" ||
      form.customer.address.trim() !== "" ||
      form.funeralType !== "" ||
      form.serviceChoice !== "" ||
      form.coffin !== "";
    if (!hasAnyInput) return;

    const snapshot = {
      customer: form.customer,
      person: form.person,
      funeralType: form.funeralType,
      serviceChoice: form.serviceChoice,
      coffin: form.coffin,
      transport: form.transport,
      additionalServices: form.additionalServices,
      disbursements: form.disbursements,
      customDisbursements: form.customDisbursements,
      customDiscounts: form.customDiscounts,
      wishes: form.wishes,
      directPackageDiscount: form.directPackageDiscount,
      arrangerNotes: form.arrangerNotes,
      deposit: form.deposit,
      coverMessage: form.coverMessage,
      notesForClient: form.notesForClient,
      showFinanceOptions: form.showFinanceOptions,
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastPushed.current) return; // nothing changed

    const t = setTimeout(async () => {
      const ref = editRef || autoDraftRef.current || generateEstimateId();
      try {
        const res = await fetch("/api/estimates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            estimateId: ref,
            customer: form.customer,
            person:
              form.customer.arrangementFor === "Someone else" ? form.person : null,
            total: totals.grandTotal,
            selections: snapshot,
            partnerRef: partnerOf || undefined,
          }),
        });
        if (res.redirected && /\/login\b/.test(res.url)) {
          // Session expired — fall back silently to localStorage-only. The
          // explicit "Save & exit" button surfaces the same condition with
          // a toast; here we don't want repeated unsolicited error noise
          // every 8s.
          return;
        }
        if (!res.ok) return;
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return;
        const data = await res.json().catch(() => ({}));
        if (!data?.ok && !data?.ref) return;
        // Remember the Ref so the next push upserts in place.
        if (!autoDraftRef.current && !editRef) {
          autoDraftRef.current = ref;
        }
        lastPushed.current = serialized;
        setAutoPushedAt(new Date().toISOString());
      } catch {
        // Transient network failure — try again on the next change.
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [form, totals.grandTotal, resumePrompt, editRef, partnerOf]);

  const resumeDraft = () => {
    const d = loadDraft();
    if (d) {
      setForm(d.form);
      setDraftSavedAt(d.savedAt);
    }
    setResumePrompt(null);
  };

  const startFresh = () => {
    clearDraft();
    setResumePrompt(null);
    setDraftSavedAt(null);
  };

  // "Save & exit" — push the current wizard state to the dashboard as a
  // Draft and send the arranger home. Re-uses `editRef` if we're already
  // working on a saved record so the row upserts rather than duplicating;
  // otherwise mints a new Ref. localStorage is cleared on success so we
  // don't double-resume from both the sheet card and the local banner.
  const saveAndExit = async () => {
    if (savingAndExiting) return;
    setSavingAndExiting(true);
    try {
      const ref = editRef || autoDraftRef.current || generateEstimateId();
      // Same snapshot shape as the PDF upload path so the dashboard row
      // and a future PDF generation agree on every field.
      const selectionsSnapshot = {
        customer: form.customer,
        person: form.person,
        funeralType: form.funeralType,
        serviceChoice: form.serviceChoice,
        coffin: form.coffin,
        transport: form.transport,
        additionalServices: form.additionalServices,
        disbursements: form.disbursements,
        customDisbursements: form.customDisbursements,
        customDiscounts: form.customDiscounts,
        wishes: form.wishes,
        directPackageDiscount: form.directPackageDiscount,
        arrangerNotes: form.arrangerNotes,
        deposit: form.deposit,
        coverMessage: form.coverMessage,
      notesForClient: form.notesForClient,
        showFinanceOptions: form.showFinanceOptions,
      };
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          estimateId: ref,
          customer: form.customer,
          person:
            form.customer.arrangementFor === "Someone else" ? form.person : null,
          total: totals.grandTotal,
          selections: selectionsSnapshot,
          partnerRef: partnerOf || undefined,
        }),
      });
      // The auth middleware redirects unauthenticated requests to /login
      // with HTTP 200 (HTML body). Without this guard, the fetch reports
      // res.ok=true and we'd silently clear localStorage and ship the user
      // back to "/" with no draft to resume. Detect it via the final URL.
      if (res.redirected && /\/login\b/.test(res.url)) {
        throw new Error("Your session has expired — please log in again");
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Unexpected response from server (not JSON)");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.ref && !data?.ok) {
        throw new Error("Server didn't confirm the draft was saved");
      }
      // Only clear local backup AFTER server confirmation — protects against
      // a partial save where the dashboard row didn't land.
      clearDraft();
      setDraftSavedAt(null);
      window.location.href = "/";
    } catch (err) {
      setTopToast({
        kind: "error",
        text:
          "Couldn't save draft — " +
          (err instanceof Error ? err.message : "unknown error"),
      });
      setSavingAndExiting(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(s + 1, stepKeys.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const toggleIn = (list: string[], name: string) =>
    list.includes(name) ? list.filter((x) => x !== name) : [...list, name];

  // ---- Step gating
  // Email is intentionally NOT required — many customers prefer phone
  // contact only. Name + telephone + branch + arrangement-for are the
  // minimum we need to follow up.
  const customerValid =
    form.customer.fullName.trim() !== "" &&
    form.customer.telephone.trim() !== "" &&
    form.customer.branch !== "" &&
    form.customer.arrangementFor !== "";

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-soft">
        <p className="heading-serif text-2xl text-navy-900">Loading pricing…</p>
        <p className="mt-2 text-sm text-mist-400">
          We're fetching the latest options from our pricing sheet.
        </p>
      </div>
    );
  }

  if (loadError && pricing.length === 0) {
    return (
      <div className="rounded-2xl border border-gold-200 bg-white p-8 shadow-soft">
        <h2 className="heading-serif text-2xl text-navy-900">
          We couldn't load the pricing right now
        </h2>
        <p className="mt-3 text-mist-400">
          Our online estimate tool is temporarily unavailable. Please call us and a member
          of our team will be glad to talk you through your options.
        </p>
        <div className="mt-5 rounded-lg bg-mist-100 p-4 text-sm text-navy-800">
          <p className="font-semibold">David Crymble &amp; Sons Funeral Directors</p>
          <p>{process.env.NEXT_PUBLIC_BUSINESS_PHONE || "028 9066 7784"}</p>
          <p>Woodstock Road · Finaghy, Belfast</p>
        </div>
        <details className="mt-4 text-xs text-mist-400">
          <summary className="cursor-pointer">Technical detail</summary>
          <p className="mt-2 break-words">{loadError}</p>
        </details>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="heading-serif text-3xl text-navy-900 sm:text-4xl">
          Pre-Arranged Funeral Estimate
        </h1>
        <p className="mt-2 text-mist-400 sm:text-lg">
          A guided way to explore your options and receive a personalised written estimate.
        </p>
        {source === "fallback" && (
          <p className="mt-3 rounded-md bg-gold-50 px-3 py-2 text-xs text-gold-800">
            Pricing displayed is illustrative only — please confirm with our team.
          </p>
        )}
      </div>

      <ProgressBar current={safeStep} total={stepKeys.length} labels={stepLabels} />

      {resumePrompt && (
        <div className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-4 text-sm text-navy-900">
          <p>
            You have a saved draft from{" "}
            <span className="font-semibold">{timeSince(resumePrompt.savedAt)}</span>.
            Pick up where you left off, or start a fresh estimate?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resumeDraft}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
            >
              Resume draft
            </button>
            <button
              type="button"
              onClick={startFresh}
              className="rounded-md border border-mist-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-800 hover:bg-mist-100"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {!resumePrompt && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-mist-400">
            {editRef
              ? `Editing ${editRef} — changes auto-save to the dashboard`
              : autoPushedAt
                ? `Saved to dashboard ${timeSince(autoPushedAt)}`
                : draftSavedAt
                  ? `Saved in this browser ${timeSince(draftSavedAt)} — pushing to dashboard…`
                  : "Auto-saves as you type"}
          </span>
          <button
            type="button"
            onClick={saveAndExit}
            disabled={savingAndExiting}
            className="rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-800 transition hover:border-navy-500 hover:bg-mist-50 disabled:opacity-50"
          >
            {savingAndExiting ? "Saving…" : "Save & exit"}
          </button>
        </div>
      )}

      {topToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            topToast.kind === "success"
              ? "bg-navy-700 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {topToast.text}
        </div>
      )}

      <div
        key={stepKey}
        className="wizard-step-enter mt-4 rounded-2xl bg-white p-5 shadow-soft sm:p-8"
      >
        {stepKey === "customer" && (
          <StepCustomer form={form} update={updateCustomer} />
        )}
        {stepKey === "person" && (
          <StepPerson person={form.person} update={updatePerson} />
        )}
        {stepKey === "funeral" && (
          <StepFuneralType
            items={
              itemsByCategory(pricing, "funeral_type").length > 0
                ? itemsByCategory(pricing, "funeral_type")
                : FUNERAL_FALLBACK
            }
            discountItem={pricing.find(
              (p) => p.category === "discount" && p.item_name === DIRECT_PACKAGE_DISCOUNT_NAME,
            )}
            selected={form.funeralType}
            discountOn={form.directPackageDiscount}
            onChange={(name) =>
              setForm((f) => {
                const direct = isDirectFuneralType(name);
                return {
                  ...f,
                  funeralType: name,
                  directPackageDiscount: direct && f.directPackageDiscount,
                  // Clear any disbursements that are bundled into a direct package
                  disbursements: direct
                    ? f.disbursements.filter((d) => !isBundledForDirect(d))
                    : f.disbursements,
                };
              })
            }
            onToggleDiscount={(on) =>
              setForm((f) => ({ ...f, directPackageDiscount: on }))
            }
          />
        )}
        {stepKey === "service" && (
          <StepSingleChoice
            title="Where would the service take place?"
            description="Choose the option that feels closest to what you'd like."
            items={
              itemsByCategory(pricing, "service_choice").length > 0
                ? itemsByCategory(pricing, "service_choice")
                : SERVICE_FALLBACK
            }
            selected={form.serviceChoice}
            onChange={(name) => setForm((f) => ({ ...f, serviceChoice: name }))}
          />
        )}
        {stepKey === "coffin" && (
          <StepSingleChoice
            title="Coffin selection"
            description="Our coffins range from simple and natural to traditional and crafted."
            items={itemsByCategory(pricing, "coffin")}
            selected={form.coffin}
            onChange={(name) => setForm((f) => ({ ...f, coffin: name }))}
          />
        )}
        {stepKey === "transport" && (
          <StepTransport
            items={itemsByCategory(pricing, "transport")}
            selected={form.transport}
            onToggle={(name) =>
              setForm((f) => ({ ...f, transport: toggleIn(f.transport, name) }))
            }
          />
        )}
        {stepKey === "additional" && (
          <StepMultiChoice
            title="Additional services"
            description="Tick anything you're interested in. You can add or remove items later."
            items={itemsByCategory(pricing, "additional_service")}
            selected={form.additionalServices}
            onToggle={(name) =>
              setForm((f) => ({
                ...f,
                additionalServices: toggleIn(f.additionalServices, name),
              }))
            }
          />
        )}
        {stepKey === "disbursements" && (
          <StepDisbursements
            items={itemsByCategory(pricing, "disbursement")}
            selected={form.disbursements}
            isDirect={isDirectFuneralType(form.funeralType)}
            customDisbursements={form.customDisbursements}
            onToggle={(name) =>
              setForm((f) => ({ ...f, disbursements: toggleIn(f.disbursements, name) }))
            }
            onAddCustom={(charge) =>
              setForm((f) => ({
                ...f,
                customDisbursements: [...f.customDisbursements, charge],
              }))
            }
            onRemoveCustom={(id) =>
              setForm((f) => ({
                ...f,
                customDisbursements: f.customDisbursements.filter((c) => c.id !== id),
              }))
            }
          />
        )}
        {stepKey === "wishes" && (
          <StepWishes
            wishes={form.wishes}
            update={(patch) =>
              setForm((f) => ({ ...f, wishes: { ...f.wishes, ...patch } }))
            }
          />
        )}
        {stepKey === "notesForClient" && (
          <StepNotesForClient
            value={form.notesForClient}
            onChange={(text) => setForm((f) => ({ ...f, notesForClient: text }))}
            coverMessage={form.coverMessage}
            onCoverMessageChange={(text) =>
              setForm((f) => ({ ...f, coverMessage: text }))
            }
          />
        )}
        {stepKey === "summary" && (
          <StepSummary
            form={form}
            lines={lines}
            totals={totals}
            setDeposit={(amount) => setForm((f) => ({ ...f, deposit: amount }))}
            setShowFinanceOptions={(on) =>
              setForm((f) => ({ ...f, showFinanceOptions: on }))
            }
            addArrangerNote={(note) =>
              setForm((f) => ({ ...f, arrangerNotes: [...f.arrangerNotes, note] }))
            }
            removeArrangerNote={(id) =>
              setForm((f) => ({
                ...f,
                arrangerNotes: f.arrangerNotes.filter((n) => n.id !== id),
              }))
            }
            addCustomDiscount={(discount) =>
              setForm((f) => ({
                ...f,
                customDiscounts: [...f.customDiscounts, discount],
              }))
            }
            removeCustomDiscount={(id) =>
              setForm((f) => ({
                ...f,
                customDiscounts: f.customDiscounts.filter((c) => c.id !== id),
              }))
            }
          />
        )}

        {stepKey === "customer" ? (
          <StepNav onNext={goNext} nextDisabled={!customerValid} hideBack />
        ) : stepKey === "summary" ? (
          <SummaryActions
            form={form}
            lines={lines}
            onBack={goBack}
            editRef={editRef}
            autoDraftRef={autoDraftRef}
            partnerOf={partnerOf}
            onDraftConsumed={() => setDraftSavedAt(null)}
          />
        ) : (
          <StepNav onBack={goBack} onNext={goNext} />
        )}
      </div>

      {stepKey !== "summary" && (
        <RunningTotal
          funeralTotal={totals.funeralTotal}
          disbursementsTotal={totals.disbursementsTotal}
        />
      )}
    </div>
  );
}

// ============== Step components ==============

function StepCustomer({
  form,
  update,
}: {
  form: FormState;
  update: (patch: Partial<FormState["customer"]>) => void;
}) {
  const c = form.customer;
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">Your details</h2>
      <p className="mt-1 text-mist-400">
        We'll use these to prepare your written estimate.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Full name *</label>
          <input
            className="field-input"
            value={c.fullName}
            onChange={(e) => update({ fullName: e.target.value })}
            autoComplete="name"
          />
        </div>
        <div>
          <label className="field-label">Telephone *</label>
          <input
            className="field-input"
            value={c.telephone}
            onChange={(e) => update({ telephone: e.target.value })}
            autoComplete="tel"
            inputMode="tel"
          />
        </div>
        <div>
          <label className="field-label">Email <span className="text-mist-400 font-normal">(optional)</span></label>
          <input
            className="field-input"
            type="email"
            value={c.email}
            onChange={(e) => update({ email: e.target.value })}
            autoComplete="email"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Address</label>
          <textarea
            className="field-input min-h-[88px]"
            value={c.address}
            onChange={(e) => update({ address: e.target.value })}
            autoComplete="street-address"
          />
          <PostcodeCouncil
            address={c.address}
            onCouncilChange={(district) => update({ councilDistrict: district })}
          />
        </div>
      </div>

      <div className="mt-6">
        <label className="field-label">Preferred branch *</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["Woodstock Road", "Finaghy"] as const).map((branch) => (
            <button
              key={branch}
              type="button"
              onClick={() => update({ branch })}
              data-selected={c.branch === branch}
              className="option-card"
            >
              <span className="text-base font-semibold text-navy-900">{branch}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <label className="field-label">This arrangement is for *</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["Myself", "Someone else", "General enquiry"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => update({ arrangementFor: opt })}
              data-selected={c.arrangementFor === opt}
              className="option-card"
            >
              <span className="text-base font-semibold text-navy-900">{opt}</span>
            </button>
          ))}
        </div>
      </div>

      {/*
        Plan-holder fields. Only shown when the customer themselves is the
        plan holder; for "Someone else" the equivalents are captured on
        the dedicated person step. Date of birth drives the finance term
        cap (paying off must complete before age 80); marital status and
        occupation are captured for the underwriter application.
      */}
      {c.arrangementFor === "Myself" && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">
              Date of birth{" "}
              <span className="text-mist-400 font-normal">
                (drives finance term)
              </span>
            </label>
            <input
              className="field-input"
              type="date"
              value={c.dateOfBirth || ""}
              onChange={(e) => update({ dateOfBirth: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Marital status</label>
            <select
              className="field-input"
              value={c.maritalStatus || ""}
              onChange={(e) => update({ maritalStatus: e.target.value })}
            >
              <option value="">— choose —</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Civil partnership">Civil partnership</option>
              <option value="Widowed">Widowed</option>
              <option value="Divorced">Divorced</option>
              <option value="Separated">Separated</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Occupation</label>
            <input
              className="field-input"
              value={c.occupation || ""}
              onChange={(e) => update({ occupation: e.target.value })}
              placeholder="e.g. Retired, Teacher, Self-employed"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepFuneralType({
  items,
  discountItem,
  selected,
  discountOn,
  onChange,
  onToggleDiscount,
}: {
  items: PriceItem[];
  discountItem?: PriceItem;
  selected: string;
  discountOn: boolean;
  onChange: (name: string) => void;
  onToggleDiscount: (on: boolean) => void;
}) {
  const showDiscount = isDirectFuneralType(selected) && !!discountItem;
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">
        What kind of funeral are you considering?
      </h2>
      <p className="mt-1 text-mist-400">
        A starting point — you can change this later when you speak with our team.
      </p>
      <div className="mt-6">
        <OptionListSingle items={items} selected={selected} onChange={onChange} />
      </div>

      {showDiscount && discountItem && (
        <div className="mt-5 rounded-xl border border-gold-200 bg-gold-50 p-4 sm:p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={discountOn}
              onChange={(e) => onToggleDiscount(e.target.checked)}
              className="mt-1 h-5 w-5 flex-shrink-0 cursor-pointer accent-navy-900"
            />
            <span className="flex-1">
              <span className="block text-base font-semibold text-navy-900">
                Apply pre-paid simple package — {formatGBP(discountItem.price)}
              </span>
              <span className="mt-1 block text-sm text-navy-800">
                {discountItem.description ||
                  "Includes a basic coffin only, with no viewing or service."}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function StepPerson({
  person,
  update,
}: {
  person: Person;
  update: (patch: Partial<Person>) => void;
}) {
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">
        Person being arranged for
      </h2>
      <p className="mt-1 text-mist-400">
        Details of the person the funeral plan is for. All optional except the
        name — share what you know now, the rest can be filled in later.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Full name *</label>
          <input
            className="field-input"
            value={person.fullName}
            onChange={(e) => update({ fullName: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">
            Date of birth{" "}
            <span className="text-mist-400 font-normal">
              (drives finance term)
            </span>
          </label>
          <input
            className="field-input"
            type="date"
            value={person.dateOfBirth}
            onChange={(e) => update({ dateOfBirth: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">Relationship to you</label>
          <input
            className="field-input"
            placeholder="e.g. mother, spouse, friend"
            value={person.relationship}
            onChange={(e) => update({ relationship: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">Marital status</label>
          <select
            className="field-input"
            value={person.maritalStatus || ""}
            onChange={(e) => update({ maritalStatus: e.target.value })}
          >
            <option value="">— choose —</option>
            <option value="Single">Single</option>
            <option value="Married">Married</option>
            <option value="Civil partnership">Civil partnership</option>
            <option value="Widowed">Widowed</option>
            <option value="Divorced">Divorced</option>
            <option value="Separated">Separated</option>
          </select>
        </div>
        <div>
          <label className="field-label">Occupation</label>
          <input
            className="field-input"
            value={person.occupation || ""}
            onChange={(e) => update({ occupation: e.target.value })}
            placeholder="e.g. Retired, Teacher"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Home address</label>
          <textarea
            className="field-input min-h-[72px]"
            value={person.address}
            onChange={(e) => update({ address: e.target.value })}
          />
          <PostcodeCouncil address={person.address} />
        </div>
        <div>
          <label className="field-label">Doctor / GP name</label>
          <input
            className="field-input"
            value={person.doctorName}
            onChange={(e) => update({ doctorName: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">Next of kin — name</label>
          <input
            className="field-input"
            value={person.nextOfKinName}
            onChange={(e) => update({ nextOfKinName: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Next of kin — telephone</label>
          <input
            className="field-input"
            inputMode="tel"
            value={person.nextOfKinPhone}
            onChange={(e) => update({ nextOfKinPhone: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function StepWishes({
  wishes,
  update,
}: {
  wishes: FormState["wishes"];
  update: (patch: Partial<FormState["wishes"]>) => void;
}) {
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">
        Wishes &amp; important information
      </h2>
      <p className="mt-1 text-mist-400">
        All optional — share as much or as little as you'd like. These details
        will appear on your written estimate so the team can prepare accordingly.
      </p>

      <section className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
          Service preferences
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4">
          <div>
            <label className="field-label">Minister / officiant name</label>
            <input
              className="field-input"
              placeholder="If you have someone particular in mind"
              value={wishes.officiant}
              onChange={(e) => update({ officiant: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Hymns &amp; music</label>
            <textarea
              className="field-input min-h-[88px]"
              placeholder="e.g. The Lord's My Shepherd, Abide with Me"
              value={wishes.music}
              onChange={(e) => update({ music: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Readings or eulogy</label>
            <textarea
              className="field-input min-h-[88px]"
              placeholder="Bible passages, poems, or who should speak"
              value={wishes.readings}
              onChange={(e) => update({ readings: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Flowers / donations in lieu</label>
            <input
              className="field-input"
              placeholder="e.g. Family flowers only, donations to Marie Curie"
              value={wishes.flowers}
              onChange={(e) => update({ flowers: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Dress code</label>
            <input
              className="field-input"
              placeholder="e.g. Bright colours welcome"
              value={wishes.dressCode}
              onChange={(e) => update({ dressCode: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Catering / wake</label>
            <textarea
              className="field-input min-h-[72px]"
              placeholder="Where, what kind of refreshments, anyone to invite"
              value={wishes.catering}
              onChange={(e) => update({ catering: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Anything else important</label>
            <textarea
              className="field-input min-h-[96px]"
              placeholder="Any other instructions, family history, or preferences"
              value={wishes.other}
              onChange={(e) => update({ other: e.target.value })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// "✨ Check with AI" under a textarea: sends the text to /api/proofread
// (which relays to the Hub's Claude) and offers the corrected version for
// one-click acceptance. Nothing is changed without the arranger's say-so.
function AiProofread({
  text,
  onReplace,
}: {
  text: string;
  onReplace: (corrected: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; corrected: string; changes: string[] }
    | { kind: "clean" }
    | { kind: "error"; message: string }
    | null
  >(null);

  const run = async () => {
    if (checking || !text.trim()) return;
    setChecking(true);
    setResult(null);
    try {
      const r = await fetch("/api/proofread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok && typeof j.corrected === "string") {
        if (j.corrected.trim() === text.trim()) setResult({ kind: "clean" });
        else
          setResult({
            kind: "ok",
            corrected: j.corrected,
            changes: Array.isArray(j.changes) ? j.changes : [],
          });
      } else {
        setResult({
          kind: "error",
          message: j?.error || "The AI check is unavailable right now.",
        });
      }
    } catch {
      setResult({ kind: "error", message: "Network error — please try again." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={checking || !text.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-mist-50 px-3 py-1.5 text-sm font-medium text-navy-800 transition hover:border-navy-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checking ? "Checking…" : "✨ Check spelling & grammar"}
      </button>

      {result?.kind === "clean" && (
        <p className="mt-2 text-sm font-medium text-navy-700">
          ✓ Reads well — no corrections needed.
        </p>
      )}
      {result?.kind === "error" && (
        <p className="mt-2 text-sm text-red-700">{result.message}</p>
      )}
      {result?.kind === "ok" && (
        <div className="mt-3 rounded-xl border border-gold-300 bg-gold-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-800">
            Suggested wording
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-navy-900">
            {result.corrected}
          </p>
          {result.changes.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-navy-800">
              {result.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onReplace(result.corrected);
                setResult(null);
              }}
              className="rounded-lg bg-navy-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800"
            >
              Use corrected
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-mist-100"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepNotesForClient({
  value,
  onChange,
  coverMessage,
  onCoverMessageChange,
}: {
  value: string;
  onChange: (text: string) => void;
  coverMessage: string;
  onCoverMessageChange: (text: string) => void;
}) {
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">
        Notes for the client
      </h2>
      <p className="mt-1 text-mist-400">
        Anything you'd like the customer to read on their estimate — a
        thank-you, clarifications about choices, or next steps. These notes
        appear on the customer-facing PDF (unlike the internal arranger log).
      </p>

      <div className="mt-6">
        <label className="field-label">Personal message — cover letter</label>
        <textarea
          className="field-input min-h-[120px]"
          maxLength={600}
          placeholder="e.g. It was lovely to meet you and your daughter on Tuesday. Please take all the time you need with this — I'm always at the end of the phone."
          value={coverMessage}
          onChange={(e) => onCoverMessageChange(e.target.value)}
        />
        <p className="mt-1 text-xs text-mist-400">
          Printed in the letter itself, right after the opening line. Keep it
          short — it sits on the letter's first page. Optional.
        </p>
        <AiProofread text={coverMessage} onReplace={onCoverMessageChange} />
      </div>

      <div className="mt-6">
        <label className="field-label">Notes</label>
        <textarea
          className="field-input min-h-[200px]"
          placeholder="e.g. As discussed, we've left flowers open so the family can decide nearer the time. Please get in touch if you'd like to revisit any of the choices below."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="mt-1 text-xs text-mist-400">Optional — leave blank if there's nothing to add.</p>
        <AiProofread text={value} onReplace={onChange} />
      </div>
    </div>
  );
}

function StepSingleChoice({
  title,
  description,
  items,
  selected,
  onChange,
}: {
  title: string;
  description: string;
  items: PriceItem[];
  selected: string;
  onChange: (name: string) => void;
}) {
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">{title}</h2>
      <p className="mt-1 text-mist-400">{description}</p>
      <div className="mt-6">
        <OptionListSingle items={items} selected={selected} onChange={onChange} />
      </div>
    </div>
  );
}

function StepMultiChoice({
  title,
  description,
  items,
  selected,
  onToggle,
}: {
  title: string;
  description: string;
  items: PriceItem[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">{title}</h2>
      <p className="mt-1 text-mist-400">{description}</p>
      <div className="mt-6">
        <OptionListMulti items={items} selected={selected} onToggle={onToggle} />
      </div>
    </div>
  );
}

function StepTransport({
  items,
  selected,
  onToggle,
}: {
  items: PriceItem[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  // If the sheet has no transport rows, present the standard list at zero price.
  const display: PriceItem[] =
    items.length > 0
      ? items
      : TRANSPORT_DEFAULTS.map((name, i) => ({
          category: "transport" as const,
          item_name: name,
          description: "",
          price: 0,
          active: true,
          sort_order: i,
        }));

  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">Transport</h2>
      <p className="mt-1 text-mist-400">
        Choose the transport arrangements you'd like for the day.
      </p>
      <div className="mt-6">
        <OptionListMulti items={display} selected={selected} onToggle={onToggle} />
      </div>
    </div>
  );
}

function StepDisbursements({
  items,
  selected,
  isDirect,
  customDisbursements,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: {
  items: PriceItem[];
  selected: string[];
  isDirect: boolean;
  customDisbursements: CustomDisbursement[];
  onToggle: (name: string) => void;
  onAddCustom: (charge: CustomDisbursement) => void;
  onRemoveCustom: (id: string) => void;
}) {
  const visibleItems = isDirect
    ? items.filter((i) => !isBundledForDirect(i.item_name))
    : items;

  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">
        Estimated third-party costs
      </h2>
      <p className="mt-1 text-mist-400">
        These are paid on your behalf to outside parties. Tick any that may apply.
      </p>

      {isDirect && (
        <div className="mt-4 rounded-lg border border-navy-200 bg-navy-50 p-4 text-sm text-navy-900">
          <p className="font-medium">
            Cemetery / crematorium and doctor's fees are included in your direct package.
          </p>
          <p className="mt-1 text-navy-800">
            You won't see those listed below — they're already covered in the
            funeral type price.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50 p-4 text-sm text-gold-900">
        These figures are estimates only. Final third-party costs are set by the
        crematorium, cemetery, doctor, or minister and may change.
      </div>
      <div className="mt-6">
        <OptionListMulti items={visibleItems} selected={selected} onToggle={onToggle} />
      </div>

      <CustomChargesPanel
        charges={customDisbursements}
        onAdd={onAddCustom}
        onRemove={onRemoveCustom}
      />
    </div>
  );
}

function DiscountsPanel({
  discounts,
  onAdd,
  onRemove,
}: {
  discounts: CustomDiscount[];
  onAdd: (d: CustomDiscount) => void;
  onRemove: (id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [amountText, setAmountText] = useState("");

  const handleAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const parsed = Number.parseFloat(amountText.replace(/[^0-9.\-]/g, ""));
    const amount = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
    if (amount <= 0) return;
    onAdd({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: trimmed,
      amount,
    });
    setLabel("");
    setAmountText("");
  };

  return (
    <section className="mt-7 rounded-xl border border-mist-200 bg-mist-50 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
        Apply a discount
      </h3>
      <p className="mt-1 text-xs text-mist-400">
        Loyalty, returning-family, pre-payment, manager discretion — type the
        reason and the £ amount. The discount appears as a negative line in
        the estimate and reduces every figure that follows (total, monthly,
        amount to finance).
      </p>

      {discounts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {discounts.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-mist-200 bg-white p-3"
            >
              <span className="flex-1 text-sm text-navy-900">{d.label}</span>
              <span className="text-sm font-medium text-red-700">
                − {formatGBP(d.amount)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                className="text-mist-400 hover:text-navy-900"
                aria-label={`Remove ${d.label}`}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <div>
          <label className="field-label" htmlFor="discount-label">Reason</label>
          <input
            id="discount-label"
            className="field-input"
            placeholder="e.g. Loyalty discount — returning family"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="discount-amount">Amount (£)</label>
          <input
            id="discount-amount"
            className="field-input"
            inputMode="decimal"
            placeholder="0.00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn-primary sm:w-auto"
          onClick={handleAdd}
          disabled={!label.trim()}
        >
          Add discount
        </button>
      </div>
    </section>
  );
}

function CustomChargesPanel({
  charges,
  onAdd,
  onRemove,
}: {
  charges: CustomDisbursement[];
  onAdd: (c: CustomDisbursement) => void;
  onRemove: (id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [priceText, setPriceText] = useState("");

  const handleAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const parsed = Number.parseFloat(priceText.replace(/[^0-9.\-]/g, ""));
    onAdd({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: trimmed,
      price: Number.isFinite(parsed) ? parsed : 0,
    });
    setLabel("");
    setPriceText("");
  };

  return (
    <section className="mt-7 rounded-xl border border-mist-200 bg-mist-50 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
        Add a custom charge
      </h3>
      <p className="mt-1 text-xs text-mist-400">
        For cemetery / council / one-off fees not in the list above. Different councils,
        resident vs non-resident rates, plot purchase vs re-opening — type whatever this
        family needs.
      </p>

      {charges.length > 0 && (
        <ul className="mt-4 space-y-2">
          {charges.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-mist-200 bg-white p-3"
            >
              <span className="flex-1 text-sm text-navy-900">{c.label}</span>
              <span className="text-sm font-medium text-navy-700">
                {formatGBP(c.price)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                className="text-mist-400 hover:text-navy-900"
                aria-label={`Remove ${c.label}`}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <div>
          <label className="field-label" htmlFor="custom-label">Description</label>
          <input
            id="custom-label"
            className="field-input"
            placeholder="e.g. Comber Cemetery — non-resident grave opening"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="custom-price">Amount (£)</label>
          <input
            id="custom-price"
            className="field-input"
            inputMode="decimal"
            placeholder="0.00"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn-primary sm:w-auto"
          onClick={handleAdd}
          disabled={!label.trim()}
        >
          Add charge
        </button>
      </div>
    </section>
  );
}

function useInstalmentApr(): number {
  // Pulls the configured APR from the spreadsheet's Settings tab. The
  // Apps Script returns a string (e.g. "0.06"); fall back to 6% if missing
  // or unparseable so the screen never goes blank.
  const [apr, setApr] = useState<number>(0.06);
  useEffect(() => {
    fetch("/api/setting?key=instalment_apr", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.value === "string" && d.value.trim() !== "") {
          const v = parseFloat(d.value);
          if (Number.isFinite(v) && v >= 0 && v <= 1) setApr(v);
        }
      })
      .catch(() => {
        // Leave default 0.06
      });
  }, []);
  return apr;
}

function StepSummary({
  form,
  lines,
  totals,
  setDeposit,
  setShowFinanceOptions,
  addArrangerNote,
  removeArrangerNote,
  addCustomDiscount,
  removeCustomDiscount,
}: {
  form: FormState;
  lines: ReturnType<typeof buildSelectedLines>;
  totals: ReturnType<typeof totalsForLines>;
  setDeposit: (amount: number) => void;
  setShowFinanceOptions: (on: boolean) => void;
  addArrangerNote: (note: ArrangerNote) => void;
  removeArrangerNote: (id: string) => void;
  addCustomDiscount: (discount: CustomDiscount) => void;
  removeCustomDiscount: (id: string) => void;
}) {
  const apr = useInstalmentApr();
  const aprPct = apr * 100;
  const aprLabel = `${aprPct % 1 === 0 ? aprPct.toFixed(0) : aprPct.toFixed(2)}%`;
  // Clamp the deposit to [0, grandTotal] before financing — a deposit larger
  // than the total just zeroes out the financed amount, never goes negative.
  const depositApplied = Math.max(
    0,
    Math.min(form.deposit || 0, totals.grandTotal),
  );
  const amountToFinance = Math.max(0, totals.grandTotal - depositApplied);
  // Age-based finance cap. The plan holder is the customer when arranging
  // for themselves, otherwise the dedicated person block. Final payment
  // must complete before age 80; unknown DOB means no cap.
  const planHolderAge = ageInYears(planHolderDob(form));
  const ageCappedMaxMonths = maxFinanceMonthsForAge(planHolderAge);
  const financeBlockedByAge =
    ageCappedMaxMonths !== null && ageCappedMaxMonths === 0;
  const funeralLines = lines.filter((l) => l.category !== "disbursement");
  const disbLines = lines.filter((l) => l.category === "disbursement");
  const isDirect = isDirectFuneralType(form.funeralType);
  const personEntries: Array<[string, string]> = (
    [
      ["Full name", form.person.fullName],
      ["Date of birth", form.person.dateOfBirth],
      ["Relationship", form.person.relationship],
      ["Marital status", form.person.maritalStatus || ""],
      ["Occupation", form.person.occupation || ""],
      ["Address", form.person.address],
      ["Doctor / GP", form.person.doctorName],
      [
        "Next of kin",
        form.person.nextOfKinName +
          (form.person.nextOfKinPhone ? ` · ${form.person.nextOfKinPhone}` : ""),
      ],
    ] as Array<[string, string]>
  ).filter(([, v]) => v && v.trim() !== "" && v.trim() !== "·");

  const wishEntries: Array<[string, string]> = (
    [
      ["Minister / officiant", form.wishes.officiant],
      ["Hymns & music", form.wishes.music],
      ["Readings", form.wishes.readings],
      ["Flowers / donations", form.wishes.flowers],
      ["Dress code", form.wishes.dressCode],
      ["Catering / wake", form.wishes.catering],
      ["Anything else", form.wishes.other],
    ] as Array<[string, string]>
  ).filter(([, v]) => v && v.trim() !== "");

  return (
    <div>
      <h2 className="heading-serif text-2xl text-navy-900 sm:text-3xl">Your estimate</h2>
      <p className="mt-1 text-mist-400">
        Please review your selections below before downloading or sending your estimate.
      </p>

      <section className="mt-6 rounded-xl border border-mist-200 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
          Customer details
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
          <SummaryRow label="Name" value={form.customer.fullName} />
          <SummaryRow label="Telephone" value={form.customer.telephone} />
          <SummaryRow label="Email" value={form.customer.email} />
          <SummaryRow label="Branch" value={form.customer.branch} />
          <SummaryRow label="Arrangement for" value={form.customer.arrangementFor} />
          <SummaryRow label="Address" value={form.customer.address} />
          {form.customer.councilDistrict && (
            <SummaryRow
              label="Council district"
              value={`${form.customer.councilDistrict} resident`}
            />
          )}
        </dl>
      </section>

      <section className="mt-5 rounded-xl border border-mist-200 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
          Funeral services
        </h3>
        {funeralLines.length === 0 ? (
          <p className="mt-3 text-sm text-mist-400">No selections yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-mist-200">
            {funeralLines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4 py-2 text-sm">
                <span className="text-navy-900">{l.item_name}</span>
                <span className="text-navy-700">{formatGBP(l.price)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex justify-between border-t border-mist-200 pt-3 text-sm font-semibold">
          <span className="text-navy-900">Subtotal</span>
          <span className="text-navy-900">{formatGBP(totals.funeralTotal)}</span>
        </div>
      </section>

      {isDirect && (
        <p className="mt-3 text-xs italic text-navy-700">
          Cemetery / crematorium and doctor's fees are included in your direct package.
        </p>
      )}

      {disbLines.length > 0 && (
        <section className="mt-5 rounded-xl border border-mist-200 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gold-700">
            Estimated third-party costs
          </h3>
          <ul className="mt-3 divide-y divide-mist-200">
            {disbLines.map((l, i) => (
              <li key={i} className="flex justify-between gap-4 py-2 text-sm">
                <span className="text-navy-900">{l.item_name}</span>
                <span className="text-navy-700">{formatGBP(l.price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-mist-200 pt-3 text-sm font-semibold">
            <span className="text-navy-900">Subtotal</span>
            <span className="text-navy-900">{formatGBP(totals.disbursementsTotal)}</span>
          </div>
          <p className="mt-2 text-xs italic text-mist-400">
            Estimated third-party costs may change.
          </p>
        </section>
      )}

      {personEntries.length > 0 && (
        <section className="mt-5 rounded-xl border border-mist-200 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
            Person being arranged for
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            {personEntries.map(([label, value]) => (
              <div key={label} className="flex flex-col sm:grid sm:grid-cols-[170px_1fr] sm:gap-3">
                <dt className="text-xs uppercase tracking-wider text-mist-400">{label}</dt>
                <dd className="text-navy-900 whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {wishEntries.length > 0 && (
        <section className="mt-5 rounded-xl border border-mist-200 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
            Wishes &amp; important information
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            {wishEntries.map(([label, value]) => (
              <div key={label} className="flex flex-col sm:grid sm:grid-cols-[170px_1fr] sm:gap-3">
                <dt className="text-xs uppercase tracking-wider text-mist-400">{label}</dt>
                <dd className="text-navy-900 whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <DiscountsPanel
        discounts={form.customDiscounts}
        onAdd={addCustomDiscount}
        onRemove={removeCustomDiscount}
      />

      <section className="mt-5 rounded-xl bg-navy-700 p-5 text-white">
        <div className="flex items-baseline justify-between">
          <span className="text-sm uppercase tracking-wider text-gold-300">
            Total estimated cost
          </span>
          <span className="heading-serif text-3xl text-white">
            {formatGBP(totals.grandTotal)}
          </span>
        </div>
      </section>

      <section
        className={`mt-5 flex items-center justify-between gap-4 rounded-xl border-2 px-5 py-4 transition ${
          form.showFinanceOptions
            ? "border-navy-300 bg-navy-50"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-navy-900">
            Plan with Grace finance options
          </p>
          <p className="mt-0.5 text-xs text-mist-400">
            {form.showFinanceOptions
              ? "ON — deposit field, monthly instalments, and With Grace partnership text appear on the PDF."
              : "OFF — none of the finance content appears. Customer sees the total only."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.showFinanceOptions}
          onClick={() => setShowFinanceOptions(!form.showFinanceOptions)}
          className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full border-2 transition ${
            form.showFinanceOptions
              ? "border-navy-700 bg-navy-600"
              : "border-mist-300 bg-mist-200"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
              form.showFinanceOptions ? "translate-x-8" : "translate-x-0.5"
            }`}
          />
          <span className="sr-only">
            {form.showFinanceOptions ? "Turn off finance options" : "Turn on finance options"}
          </span>
        </button>
        <span
          className={`hidden text-sm font-semibold sm:inline ${
            form.showFinanceOptions ? "text-navy-700" : "text-amber-700"
          }`}
        >
          {form.showFinanceOptions ? "ON" : "OFF"}
        </span>
      </section>

      {form.showFinanceOptions && totals.grandTotal > 0 && (
        <section className="mt-5 rounded-xl border border-mist-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
            Monthly plan options — David Crymble &amp; Sons "With Grace"
          </h3>
          <p className="mt-1 text-xs text-mist-400">
            First 24 months interest-free. Beyond that, {aprLabel} APR is applied to the remaining balance.
            {planHolderAge !== null && (
              <>
                {" "}Plan holder is {planHolderAge}
                {financeBlockedByAge ? (
                  <> — at age {FINANCE_MAX_AGE} or above, monthly finance is not offered.</>
                ) : ageCappedMaxMonths !== null ? (
                  <>
                    {" "}— terms capped at {ageCappedMaxMonths / 12} year
                    {ageCappedMaxMonths / 12 === 1 ? "" : "s"} so the final
                    payment lands before age {FINANCE_MAX_AGE}.
                  </>
                ) : null}
              </>
            )}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr] sm:items-end">
            <div>
              <label className="field-label">Deposit / paid today</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-400">£</span>
                <input
                  className="field-input pl-7"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.deposit > 0 ? String(form.deposit) : ""}
                  placeholder="0.00"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setDeposit(Number.isFinite(v) && v >= 0 ? v : 0);
                  }}
                />
              </div>
            </div>
            {depositApplied > 0 && (
              <p className="text-xs text-mist-400 sm:pb-3">
                <span className="font-medium text-navy-800">{formatGBP(depositApplied)}</span> deducted —
                financing <span className="font-medium text-navy-800">{formatGBP(amountToFinance)}</span>{" "}
                of the {formatGBP(totals.grandTotal)} total.
              </p>
            )}
          </div>

          {financeBlockedByAge ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Monthly plan options aren't available — finance is only offered
              while the plan holder is under age {FINANCE_MAX_AGE}.
            </p>
          ) : (
          <ul className="mt-3 divide-y divide-mist-200">
            {monthlyInstalmentOptions(amountToFinance, apr, ageCappedMaxMonths ?? undefined).map((opt) => (
              <li
                key={opt.months}
                className="flex flex-col py-2 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span>
                  <span className="font-semibold text-navy-900">{opt.yearLabel}</span>
                  <span className="ml-2 text-xs text-mist-400">
                    ({opt.months} monthly instalments)
                  </span>
                </span>
                <span className="text-right">
                  <span className="heading-serif text-lg font-semibold text-navy-900">
                    {formatGBP(opt.monthly)}
                  </span>
                  <span className="ml-1 text-xs text-mist-400">/ month</span>
                  {opt.isFinanced && (
                    <span className="block text-[11px] italic text-mist-400">
                      Finance charge {formatGBP(opt.financeCharge)} ({aprLabel} APR after 24 months)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          )}
          {!financeBlockedByAge && (
            <p className="mt-3 text-[11px] italic text-mist-400">
              Figures are illustrative — your final monthly amount will be confirmed at sign-up.
            </p>
          )}
        </section>
      )}

      <ArrangerNotesLog
        notes={form.arrangerNotes}
        onAdd={addArrangerNote}
        onRemove={removeArrangerNote}
      />

      <p className="mt-5 text-xs italic leading-relaxed text-mist-400">
        {PDF_DISCLAIMER}
      </p>
    </div>
  );
}

function ArrangerNotesLog({
  notes,
  onAdd,
  onRemove,
}: {
  notes: ArrangerNote[];
  onAdd: (note: ArrangerNote) => void;
  onRemove: (id: string) => void;
}) {
  const [arranger, setArranger] = useState("");
  const [text, setText] = useState("");

  // Default the arranger's name to the signed-in user; fall back to a
  // previously-typed name in localStorage if the API call fails for any reason.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.name) {
          setArranger(data.name);
          return;
        }
        const stored = localStorage.getItem("dcfs-arranger-name");
        if (stored) setArranger(stored);
      })
      .catch(() => {
        const stored = localStorage.getItem("dcfs-arranger-name");
        if (stored) setArranger(stored);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = () => {
    const trimmedName = arranger.trim();
    const trimmedText = text.trim();
    if (!trimmedName || !trimmedText) return;
    onAdd({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      arranger: trimmedName,
      timestamp: new Date().toISOString(),
      text: trimmedText,
    });
    localStorage.setItem("dcfs-arranger-name", trimmedName);
    setText("");
  };

  const sorted = [...notes].sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
  );

  return (
    <section className="mt-5 rounded-xl border border-mist-200 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-navy-800">
        Funeral arranger notes
      </h3>
      <p className="mt-1 text-xs text-mist-400">
        Internal log — each entry is stamped with the arranger's name and the time. Staff-only — notes do not appear on the customer PDF.
      </p>

      {sorted.length > 0 && (
        <ul className="mt-4 space-y-3">
          {sorted.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-mist-200 bg-mist-50 p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-navy-800">
                  {n.arranger}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-mist-400">
                    {formatNoteTimestamp(n.timestamp)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(n.id)}
                    className="text-xs text-mist-400 hover:text-navy-900"
                    aria-label="Remove note"
                    title="Remove note"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-navy-900">{n.text}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <div>
          <label className="field-label">Arranger</label>
          <input
            className="field-input"
            placeholder="Your name"
            value={arranger}
            onChange={(e) => setArranger(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Note</label>
          <textarea
            className="field-input min-h-[64px]"
            placeholder="Type a note and press Add"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn-primary sm:w-auto"
          onClick={handleAdd}
          disabled={!arranger.trim() || !text.trim()}
        >
          Add note
        </button>
      </div>
      <p className="mt-1 text-xs text-mist-400">Tip: ⌘/Ctrl + Enter also adds a note.</p>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wider text-mist-400">{label}</dt>
      <dd className="text-navy-900">{value || "—"}</dd>
    </div>
  );
}

function SummaryActions({
  form,
  lines,
  onBack,
  editRef,
  autoDraftRef,
  partnerOf,
  onDraftConsumed,
}: {
  form: FormState;
  lines: ReturnType<typeof buildSelectedLines>;
  onBack: () => void;
  editRef: string | null;
  // Server-assigned ref for this wizard's auto-pushed draft (if any).
  // Used as a fallback when editRef isn't set, so the partner button can
  // still pass a real Ref to the new tab without forcing the arranger to
  // generate the PDF first.
  autoDraftRef?: React.MutableRefObject<string | null>;
  // Set when this wizard was opened as a partner quote — the originating
  // record's Ref. We forward it on save (Apps Script writes Partner Ref
  // on the new row) and then PATCH the origin to point back at us.
  partnerOf?: string | null;
  // Notify the parent that the in-flight draft has been finalised (PDF
  // downloaded or sent), so it can clear the "Draft saved X ago" indicator.
  onDraftConsumed?: () => void;
}) {
  const apr = useInstalmentApr();
  const [downloading, setDownloading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postPreview, setPostPreview] = useState<{
    url: string;
    result: { bytes: Uint8Array; filename: string; estimateId: string };
    name: string;
    address: string;
  } | null>(null);
  const [arrangerName, setArrangerName] = useState<string>("");
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Toast auto-dismisses after 6 seconds. Stored in a ref-less effect so
  // each new toast resets the timer cleanly.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch the signed-in user's name once so we can put "Yours sincerely,
  // <name>" on the cover letter. Falls back to the firm name on failure.
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.name) setArrangerName(d.name);
      })
      .catch(() => {
        // Fine — generateEstimatePdf falls back to "David Crymble & Sons".
      });
  }, []);

  // Build the same payload that goes to /api/upload-pdf (the Apps Script
  // appends a row to the Estimates sheet from this — same payload from any
  // entry point keeps the dashboard consistent regardless of which button
  // staff used to generate the PDF).
  const buildUploadBody = (
    pdfResult: { bytes: Uint8Array; filename: string; estimateId: string },
  ) => {
    const totalsForUpload = totalsForLines(lines);
    const selectionsSnapshot = {
      customer: form.customer,
      person: form.person,
      funeralType: form.funeralType,
      serviceChoice: form.serviceChoice,
      coffin: form.coffin,
      transport: form.transport,
      additionalServices: form.additionalServices,
      disbursements: form.disbursements,
      customDisbursements: form.customDisbursements,
      customDiscounts: form.customDiscounts,
      wishes: form.wishes,
      directPackageDiscount: form.directPackageDiscount,
      // Arranger notes — staff log that follows the estimate. Persisted
      // so reopening the record from the dashboard shows the same notes
      // the original arranger left, even if a different staff member
      // picks it up later.
      arrangerNotes: form.arrangerNotes,
      deposit: form.deposit,
      coverMessage: form.coverMessage,
      notesForClient: form.notesForClient,
      showFinanceOptions: form.showFinanceOptions,
    };
    return {
      pdfBase64: uint8ArrayToBase64(pdfResult.bytes),
      filename: pdfResult.filename,
      estimateId: pdfResult.estimateId,
      customer: form.customer,
      person:
        form.customer.arrangementFor === "Someone else" ? form.person : null,
      total: totalsForUpload.grandTotal,
      selections: selectionsSnapshot,
      // Partner linking — when this wizard was launched from another
      // quote's "+ Start partner quote" button, partnerOf carries the
      // originating Ref. Apps Script writes it into this row's Partner
      // Ref column so the dashboard can show the two cards as paired.
      partnerRef: partnerOf || undefined,
    };
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await generateEstimatePdf(
        form,
        lines,
        editRef || autoDraftRef?.current || undefined,
        { arrangerName, apr },
      );
      // Fire-and-forget save to the Estimates dashboard. We don't gate the
      // success toast on the upload — the customer already has the PDF and
      // the dashboard log is best-effort. Failures still surface in console
      // for debugging without blocking the user.
      try {
        await fetch("/api/upload-pdf", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildUploadBody(result)),
        });
      } catch (err) {
        console.error("Drive upload failed (download path):", err);
      }
      // Two-way partner link. The new record carries partnerRef ->
      // origin (written above by Apps Script during the upload). Now we
      // patch the origin so it carries partnerRef -> this new ref. Best
      // effort — link visibility is a nicety, not blocking.
      if (partnerOf) {
        try {
          await fetch("/api/estimates", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ref: partnerOf,
              partnerRef: result.estimateId,
            }),
          });
        } catch (err) {
          console.error("Partner back-link failed (download path):", err);
        }
      }
      setToast({
        kind: "success",
        text: `PDF downloaded · Ref ${result.estimateId}`,
      });
      // Estimate finalised — drop the in-flight wizard draft so the
      // next /new visit starts clean.
      clearDraft();
      onDraftConsumed?.();
    } catch (err) {
      console.error(err);
      setToast({
        kind: "error",
        text: "Couldn't generate PDF — please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsApp = async () => {
    if (downloading) return;
    // Background pipeline: generate PDF in memory (no local download —
    // mobile browsers can't reliably trigger it), upload bytes to Drive
    // via /api/upload-pdf (which also logs a row to the Estimates sheet),
    // then post a WhatsApp message with the Drive link via /api/beepmate.
    // Failures at any step degrade gracefully and surface in a toast.
    setDownloading(true);
    let pdfResult: { bytes: Uint8Array; filename: string; estimateId: string };
    try {
      pdfResult = await generateEstimatePdf(
        form,
        lines,
        editRef || autoDraftRef?.current || undefined,
        { skipDownload: true, arrangerName, apr },
      );
    } catch (err) {
      console.error("PDF generation failed:", err);
      setToast({ kind: "error", text: "Couldn't generate PDF — please try again." });
      setDownloading(false);
      return;
    }

    let driveUrl: string | null = null;
    let driveError: string | null = null;
    try {
      const resp = await fetch("/api/upload-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildUploadBody(pdfResult)),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.url) {
        driveUrl = data.url as string;
      } else if (resp.status !== 503) {
        driveError = data?.error || `upload returned ${resp.status}`;
      }
    } catch (err) {
      console.error("Drive upload failed:", err);
      driveError = err instanceof Error ? err.message : "upload failed";
    }

    const totals = totalsForLines(lines);
    const isForSomeoneElse = form.customer.arrangementFor === "Someone else";
    const messageLines = [
      `📋 NEW ESTIMATE — ${form.customer.fullName || "(no name)"}`,
      `Ref: ${pdfResult.estimateId}`,
      "",
      `Phone: ${form.customer.telephone || "—"}`,
      `Email: ${form.customer.email || "—"}`,
      `Branch: ${form.customer.branch || "—"}`,
      `For: ${form.customer.arrangementFor || "—"}`,
      ...(isForSomeoneElse && form.person.fullName.trim() !== ""
        ? [
            "",
            `Person: ${form.person.fullName}` +
              (form.person.relationship ? ` (${form.person.relationship})` : ""),
            ...(form.person.dateOfBirth ? [`DOB: ${form.person.dateOfBirth}`] : []),
          ]
        : []),
      "",
      "Selections:",
      ...lines.map((l) => `• ${l.item_name} — ${formatGBP(l.price)}`),
      "",
      `Total: ${formatGBP(totals.grandTotal)}`,
      // Branded link masks the raw Drive URL — the /p/[ref] route on the
      // app domain 302s through to the actual file. Falls back to the
      // raw Drive URL if for some reason driveUrl is set but we don't
      // have an estimateId (defensive).
      ...(driveUrl
        ? [
            "",
            `📎 PDF: ${
              typeof window !== "undefined" && pdfResult.estimateId
                ? `${window.location.origin}/p/${encodeURIComponent(pdfResult.estimateId)}`
                : driveUrl
            }`,
          ]
        : []),
    ];
    const message = messageLines.join("\n");

    try {
      const res = await fetch("/api/beepmate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Post-send admin: if this was a previously-booked appointment,
      // promote it from "Appointment" to "Quoted" now that the wizard
      // is done. Failures here are silent — the WhatsApp message has
      // already gone, the user-facing happy path is preserved.
      if (editRef) {
        try {
          await fetch("/api/estimates", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ref: editRef, status: "Quoted" }),
          });
        } catch {
          // Ignore — staff can move it manually on the dashboard.
        }
      }

      // Cross-link: if this wizard was opened as a partner quote, patch
      // the origin record so its Partner Ref points back at us. Same
      // best-effort posture as the rest of post-send admin.
      if (partnerOf) {
        try {
          await fetch("/api/estimates", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ref: partnerOf,
              partnerRef: pdfResult.estimateId,
            }),
          });
        } catch {
          // Ignore — link is a nicety, not blocking.
        }
      }

      // Schedule a 7-day follow-up reminder in Outlook (next weekday at
      // 9am). Best-effort — if MS isn't connected, /api/microsoft/event
      // returns 500/503 and we just skip silently.
      let followUpNote = "";
      try {
        const start = followUpStartIso();
        const end = addMinutesIsoLocal(start, 30);
        const subject =
          `Follow up: ${form.customer.fullName || "customer"} — Pre-arrangement plan`;
        const bodyHtml =
          `<p>Reference: <b>${pdfResult.estimateId}</b></p>` +
          `<p>Phone: ${form.customer.telephone || "—"}</p>` +
          `<p>Branch: ${form.customer.branch || "—"}</p>` +
          (driveUrl ? `<p>PDF: <a href="${driveUrl}">${driveUrl}</a></p>` : "");
        const fuRes = await fetch("/api/microsoft/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, start, end, bodyHtml }),
        });
        if (fuRes.ok) {
          followUpNote = " · 7-day follow-up added to Outlook";
        }
      } catch {
        // No-op; reminder is best-effort.
      }

      setToast({
        kind: "success",
        text: driveUrl
          ? `Sent · Ref ${pdfResult.estimateId} · PDF link in message${followUpNote}`
          : `Sent · Ref ${pdfResult.estimateId}${driveError ? ` · (Drive: ${driveError})` : ""}${followUpNote}`,
      });
      // Estimate is out the door — drop the in-flight wizard draft so
      // the next /new visit starts clean.
      clearDraft();
      onDraftConsumed?.();
    } catch (err) {
      console.error("WhatsApp send failed:", err);
      setToast({
        kind: "error",
        text:
          "Couldn't send to WhatsApp — " +
          (err instanceof Error ? err.message : "unknown error"),
      });
    } finally {
      setDownloading(false);
    }
  };

  // ── Post by letter (Stannp via the Hub) ──
  // Two-step: build the letter (with its Stannp cover page) and show it in
  // a preview modal first; nothing is posted until the arranger confirms.
  const handlePostLetter = async () => {
    if (downloading || posting) return;
    const name = (form.customer.fullName || "").trim();
    const address = (form.customer.address || "").trim();
    const pcRe = /\b[A-Za-z]{1,2}[0-9][A-Za-z0-9]?\s*[0-9][A-Za-z]{2}\b/;
    if (!name || !address) {
      setToast({
        kind: "error",
        text: "The client needs a name and address (step 1) before this can be posted.",
      });
      return;
    }
    if (!pcRe.test(address)) {
      setToast({
        kind: "error",
        text: "The client's address needs a postcode before this can be posted.",
      });
      return;
    }
    setDownloading(true);
    try {
      const result = await generateEstimatePdf(
        form,
        lines,
        editRef || autoDraftRef?.current || undefined,
        { skipDownload: true, arrangerName, apr, postCover: true },
      );
      const blob = new Blob([result.bytes.buffer as ArrayBuffer], {
        type: "application/pdf",
      });
      setPostPreview({
        url: URL.createObjectURL(blob),
        result,
        name,
        address,
      });
    } catch (err) {
      console.error(err);
      setToast({ kind: "error", text: "Couldn't generate the letter — please try again." });
    } finally {
      setDownloading(false);
    }
  };

  const closePostPreview = () => {
    if (postPreview) URL.revokeObjectURL(postPreview.url);
    setPostPreview(null);
  };

  const confirmPostLetter = async () => {
    if (!postPreview || posting) return;
    setPosting(true);
    try {
      const r = await fetch("/api/post-letter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pdf:
            "data:application/pdf;base64," +
            uint8ArrayToBase64(postPreview.result.bytes),
          name: postPreview.name,
          address: postPreview.address,
          doc_name: `Pre-arrangement estimate — ${postPreview.result.estimateId}`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        // Best-effort log to the Estimates dashboard, same as the
        // download/WhatsApp paths — the letter is already on its way.
        try {
          await fetch("/api/upload-pdf", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildUploadBody(postPreview.result)),
          });
        } catch {}
        setToast({
          kind: "success",
          text: `Letter posted${j.price ? ` (${j.price})` : ""} · Ref ${postPreview.result.estimateId}`,
        });
        closePostPreview();
        clearDraft();
        onDraftConsumed?.();
      } else {
        setToast({
          kind: "error",
          text: "Post failed: " + (j?.error || "the postal service rejected the letter."),
        });
      }
    } catch (err) {
      setToast({
        kind: "error",
        text: "Post failed — " + (err instanceof Error ? err.message : "network error"),
      });
    } finally {
      setPosting(false);
    }
  };

  // Open a fresh wizard tab pre-filled with this household's contact
  // details so the arranger can quote a partner without re-typing phone,
  // email, branch, address. The new quote saves as a separate record;
  // if we know our own Ref (either editRef or the auto-pushed draft Ref)
  // we pass it as ?partnerOf=… so the new wizard can write the cross-link
  // back on its first save.
  const handleStartPartnerQuote = () => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "dcfs:partnerHousehold",
        JSON.stringify({
          telephone: form.customer.telephone,
          email: form.customer.email,
          branch: form.customer.branch,
          address: form.customer.address,
          councilDistrict: form.customer.councilDistrict || "",
        }),
      );
    } catch {
      // Storage can fail in private-browsing mode — the new tab will
      // just open empty, which is no worse than the existing "+ New
      // estimate" link.
    }
    const originRef = editRef || autoDraftRef?.current || "";
    const url = originRef
      ? `/new?partner=1&partnerOf=${encodeURIComponent(originRef)}`
      : "/new?partner=1";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mt-8 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back
        </button>
        <button
          type="button"
          onClick={handleWhatsApp}
          disabled={downloading}
          className="btn-primary"
        >
          {downloading ? "Sending…" : "Send to Crymble & Sons WhatsApp"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn-gold"
        >
          {downloading ? "Generating…" : "⬇ Download PDF Estimate"}
        </button>
        <button
          type="button"
          onClick={handlePostLetter}
          disabled={downloading || posting}
          className="btn-secondary"
        >
          {downloading ? "Preparing…" : "📮 Post by letter"}
        </button>
      </div>

      {postPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Letter preview"
        >
          <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-mist-50 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-mist-200 px-5 py-4">
              <div>
                <h3 className="heading-serif text-xl font-semibold text-navy-900">
                  Preview before posting
                </h3>
                <p className="mt-1 text-sm text-navy-800">
                  Will be printed, enveloped and mailed to:{" "}
                  <span className="font-medium">
                    {postPreview.name}, {postPreview.address}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-mist-400">
                  Page 1 is the address carrier — Stannp prints the address and
                  its postal marks there. Your estimate starts on page 2.
                </p>
              </div>
              <button
                type="button"
                onClick={closePostPreview}
                className="rounded-lg px-2 py-1 text-2xl leading-none text-navy-700 hover:bg-mist-100"
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <iframe
              src={postPreview.url}
              title="Letter preview"
              className="min-h-0 w-full flex-1 bg-white"
            />
            <div className="flex flex-col gap-2 border-t border-mist-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closePostPreview}
                disabled={posting}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPostLetter}
                disabled={posting}
                className="btn-gold"
              >
                {posting ? "Posting…" : "📮 Post letter (about £1)"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleStartPartnerQuote}
          className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
        >
          + Start a second quote for partner (same household)
        </button>
      </div>
      <p className="text-center text-xs text-mist-400">
        This estimate is not a confirmed funeral contract.
      </p>

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
