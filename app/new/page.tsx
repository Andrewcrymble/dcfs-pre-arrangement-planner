"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/estimate";
import { DIRECT_PACKAGE_DISCOUNT_NAME } from "@/lib/types";
import { generateEstimatePdf } from "@/lib/pdf";
import type {
  ArrangerNote,
  CustomDisbursement,
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
  },
  person: EMPTY_PERSON,
  funeralType: "",
  serviceChoice: "",
  coffin: "",
  transport: [],
  additionalServices: [],
  disbursements: [],
  customDisbursements: [],
  wishes: EMPTY_WISHES,
  directPackageDiscount: false,
  arrangerNotes: [],
};

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
  const [pricing, setPricing] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<"sheet" | "fallback">("sheet");

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

  const updateCustomer = (patch: Partial<FormState["customer"]>) =>
    setForm((f) => ({ ...f, customer: { ...f.customer, ...patch } }));
  const updatePerson = (patch: Partial<Person>) =>
    setForm((f) => ({ ...f, person: { ...f.person, ...patch } }));

  const goNext = () => setStep((s) => Math.min(s + 1, stepKeys.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const toggleIn = (list: string[], name: string) =>
    list.includes(name) ? list.filter((x) => x !== name) : [...list, name];

  // ---- Step gating
  const customerValid =
    form.customer.fullName.trim() !== "" &&
    form.customer.telephone.trim() !== "" &&
    form.customer.email.trim() !== "" &&
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

      <div className="rounded-2xl bg-white p-5 shadow-soft sm:p-8">
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
        {stepKey === "summary" && (
          <StepSummary
            form={form}
            lines={lines}
            totals={totals}
            addArrangerNote={(note) =>
              setForm((f) => ({ ...f, arrangerNotes: [...f.arrangerNotes, note] }))
            }
            removeArrangerNote={(id) =>
              setForm((f) => ({
                ...f,
                arrangerNotes: f.arrangerNotes.filter((n) => n.id !== id),
              }))
            }
          />
        )}

        {stepKey === "customer" ? (
          <StepNav onNext={goNext} nextDisabled={!customerValid} hideBack />
        ) : stepKey === "summary" ? (
          <SummaryActions form={form} lines={lines} onBack={goBack} />
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
          <label className="field-label">Email *</label>
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
          <label className="field-label">Date of birth</label>
          <input
            className="field-input"
            type="text"
            placeholder="e.g. 14 March 1945"
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
        <div className="sm:col-span-2">
          <label className="field-label">Home address</label>
          <textarea
            className="field-input min-h-[72px]"
            value={person.address}
            onChange={(e) => update({ address: e.target.value })}
          />
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

function StepSummary({
  form,
  lines,
  totals,
  addArrangerNote,
  removeArrangerNote,
}: {
  form: FormState;
  lines: ReturnType<typeof buildSelectedLines>;
  totals: ReturnType<typeof totalsForLines>;
  addArrangerNote: (note: ArrangerNote) => void;
  removeArrangerNote: (id: string) => void;
}) {
  const funeralLines = lines.filter((l) => l.category !== "disbursement");
  const disbLines = lines.filter((l) => l.category === "disbursement");
  const isDirect = isDirectFuneralType(form.funeralType);
  const personEntries: Array<[string, string]> = (
    [
      ["Full name", form.person.fullName],
      ["Date of birth", form.person.dateOfBirth],
      ["Relationship", form.person.relationship],
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
}: {
  form: FormState;
  lines: ReturnType<typeof buildSelectedLines>;
  onBack: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
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

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await generateEstimatePdf(form, lines);
      setToast({
        kind: "success",
        text: `PDF downloaded · Ref ${result.estimateId}`,
      });
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
      pdfResult = await generateEstimatePdf(form, lines, undefined, {
        skipDownload: true,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      setToast({ kind: "error", text: "Couldn't generate PDF — please try again." });
      setDownloading(false);
      return;
    }

    let driveUrl: string | null = null;
    let driveError: string | null = null;
    try {
      const pdfBase64 = uint8ArrayToBase64(pdfResult.bytes);
      const totalsForUpload = totalsForLines(lines);
      const resp = await fetch("/api/upload-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          filename: pdfResult.filename,
          estimateId: pdfResult.estimateId,
          customer: form.customer,
          person:
            form.customer.arrangementFor === "Someone else"
              ? form.person
              : null,
          total: totalsForUpload.grandTotal,
        }),
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
      ...(driveUrl ? ["", `📎 PDF: ${driveUrl}`] : []),
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
      setToast({
        kind: "success",
        text: driveUrl
          ? `Sent · Ref ${pdfResult.estimateId} · PDF link in message`
          : `Sent · Ref ${pdfResult.estimateId}${driveError ? ` · (Drive: ${driveError})` : ""}`,
      });
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
