"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { calculate, generateCalculatorPdf } from "@/lib/calculatorPdf";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const num = (s: string): number => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
};

export default function CalculatorPage() {
  const [planName, setPlanName] = useState("Bluebell Cremation Plan");
  const [basePrice, setBasePrice] = useState("2690");
  const [term, setTerm] = useState("60");
  const [interestFree, setInterestFree] = useState("24");
  const [totalFees, setTotalFees] = useState("512.85");
  const [deposit, setDeposit] = useState("0");
  const [downloading, setDownloading] = useState(false);

  const inputs = useMemo(
    () => ({
      planName: planName.trim(),
      basePrice: num(basePrice),
      termMonths: Math.max(1, Math.floor(num(term))),
      interestFreeMonths: Math.max(0, Math.floor(num(interestFree))),
      totalFees: num(totalFees),
      deposit: num(deposit),
    }),
    [planName, basePrice, term, interestFree, totalFees, deposit],
  );

  const results = useMemo(() => calculate(inputs), [inputs]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await generateCalculatorPdf(inputs);
    } catch (err) {
      console.error(err);
      alert("Couldn't generate PDF — please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading-serif text-3xl text-navy-900 sm:text-4xl">
            Plan instalment calculator
          </h1>
          <p className="mt-1 text-mist-400 sm:text-lg">
            Work out monthly instalments and the interest-free breakdown for any plan.
          </p>
        </div>
        <Link href="/" className="btn-secondary self-start sm:self-auto">
          ← Back to dashboard
        </Link>
      </div>

      {/* Inputs card */}
      <section className="rounded-2xl border border-mist-200 bg-[#fdfaf2] p-5 shadow-soft sm:p-7">
        <h2 className="heading-serif text-xl text-navy-800">Plan details</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="planName">Plan name</label>
            <input
              id="planName"
              className="field-input"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="basePrice">Base plan price (£)</label>
            <input
              id="basePrice"
              className="field-input"
              inputMode="decimal"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="totalFees">Total fees / finance charge (£)</label>
            <input
              id="totalFees"
              className="field-input"
              inputMode="decimal"
              value={totalFees}
              onChange={(e) => setTotalFees(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="term">Payment term (months)</label>
            <input
              id="term"
              className="field-input"
              inputMode="numeric"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="if">Interest-free period (months)</label>
            <input
              id="if"
              className="field-input"
              inputMode="numeric"
              value={interestFree}
              onChange={(e) => setInterestFree(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="deposit">Deposit (optional, £)</label>
            <input
              id="deposit"
              className="field-input"
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Results card */}
      <section className="rounded-2xl border border-mist-200 bg-[#fdfaf2] p-5 shadow-soft sm:p-7">
        <h2 className="heading-serif text-2xl text-navy-800">{inputs.planName || "Your plan"}</h2>

        <dl className="mt-5 space-y-2 text-sm">
          <Row label="Base plan price" value={fmt(inputs.basePrice)} />
          <Row label="Payment format" value={`${inputs.termMonths} monthly instalments`} />
          <Row label="Interest-free period" value={`First ${inputs.interestFreeMonths} months interest free`} />
          <Row label="Total fees / finance charge" value={fmt(inputs.totalFees)} />
          {inputs.deposit > 0 && <Row label="Deposit" value={`−${fmt(inputs.deposit)}`} />}
        </dl>

        <div className="my-5 border-t border-mist-200" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Highlight label="Total amount payable" value={fmt(results.totalPayable)} />
          <Highlight label="Monthly payment" value={fmt(results.monthlyPayment)} />
        </div>

        <div className="my-5 border-t border-mist-200" />

        <h3 className="heading-serif text-lg text-navy-800">Payment breakdown</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Number of payments" value={String(inputs.termMonths)} />
          <Row label="Monthly payment (incl. fees)" value={fmt(results.monthlyPayment)} />
          <Row label="Paid during interest-free period" value={fmt(results.interestFreeAmount)} />
          <Row label="Remaining after interest-free period" value={fmt(results.remainingAfterIf)} />
          <Row label="Finance charge applied after interest-free period" value={fmt(results.financeCharge)} />
        </dl>

        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="btn-gold"
          >
            {downloading ? "Generating…" : "⬇ Download PDF"}
          </button>
        </div>

        <p className="mt-6 border-t border-mist-200 pt-4 text-xs italic text-mist-400">
          This calculator provides an estimate only. Payment terms, fees, and finance options
          may vary. Please speak to our team for an accurate quotation.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mist-400">{label}</dt>
      <dd className="font-medium text-navy-900">{value}</dd>
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#7a1f2e]/20 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-mist-400">{label}</p>
      <p className="heading-serif text-2xl font-semibold text-[#7a1f2e]">{value}</p>
    </div>
  );
}
