"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import InscriptionDesigner, {
  DEFAULT_INSCRIPTION_DESIGN,
  type InscriptionDesign,
} from "@/components/InscriptionDesigner";
import {
  STATUS_PIPELINE,
  emptyOrder,
  inscriptionPricing,
  recalcTotals,
  shortRef,
  type HeadstoneOrder,
  type HeadstoneStatus,
} from "@/lib/headstoneOrder";

interface PriceBook {
  Headstones?: { type: string; size: string; cost: number; sell: number }[];
  Headstone_Colours?: { name: string; costAdj: number; sellAdj: number }[];
  Surrounds?: {
    type: string;
    baseCost: number;
    baseSell: number;
    graniteCostAdd: number;
    graniteSellAdd: number;
  }[];
  Stones?: {
    type: string;
    standaloneCost: number;
    withSurroundCost: number;
    sell: number;
  }[];
  Accessories?: { name: string; cost: number; sell: number; size?: string }[];
  Cemetery_Fees?: { location: string; fee: number }[];
  Services?: { name: string; cost: number; sell: number }[];
  NewInscription?: {
    freeLetter: number;
    costPerLetterAfter100: number;
    sellPerLetterAfter100: number;
  };
  AdditionalInscription?: {
    costPerLetterAfter50: number;
    sellPerLetterAfter50: number;
  };
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(isFinite(n) ? n : 0);
}

export default function HeadstoneEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id || "";

  const [order, setOrder] = useState<HeadstoneOrder | null>(null);
  const [priceBook, setPriceBook] = useState<PriceBook>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Initial load: orders list + price book. We pull the list (rather
  // than a single-order endpoint) because the Apps Script's doGet
  // already serves it, and adding a single-order endpoint upstream is
  // out of scope for this round.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [oRes, pbRes] = await Promise.all([
          fetch("/api/headstones/orders", { cache: "no-store" }),
          fetch("/api/headstones/price-book", { cache: "no-store" }),
        ]);
        const oData = await oRes.json();
        const pbData = await pbRes.json();
        if (!oRes.ok) throw new Error(oData?.error || `HTTP ${oRes.status}`);
        if (cancelled) return;
        setPriceBook(pbData?.priceBook || {});
        // Treat the orders payload as untrusted JSON — normalizeIncoming
        // is the boundary that coerces it into HeadstoneOrder shape, so
        // upstream the items are best typed as plain records.
        const list: Record<string, unknown>[] = Array.isArray(oData?.orders)
          ? oData.orders
          : [];
        const found = list.find((o) => o.orderId === id);
        if (found) {
          setOrder(recalcTotals(normalizeIncoming(found)));
        } else {
          // New order — empty template with this id pre-baked in.
          setOrder(emptyOrder(id));
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const update = useCallback(<K extends keyof HeadstoneOrder>(
    k: K,
    v: HeadstoneOrder[K],
  ) => {
    setOrder((prev) => (prev ? recalcTotals({ ...prev, [k]: v }) : prev));
  }, []);

  // Auto-update inscription pricing when text or type changes.
  useEffect(() => {
    if (!order) return;
    const letters = (order.inscriptionText.match(/[A-Za-z0-9]/g) || []).length;
    if (letters === order.inscriptionLines && order.inscriptionSellPrice >= 0)
      return;
    const { sell, cost } = inscriptionPricing(
      letters,
      order.inscriptionType,
      priceBook,
    );
    setOrder((prev) =>
      prev
        ? recalcTotals({
            ...prev,
            inscriptionLines: letters,
            inscriptionSellPrice: sell,
            inscriptionCostPrice: cost,
          })
        : prev,
    );
  }, [order?.inscriptionText, order?.inscriptionType, priceBook]); // eslint-disable-line react-hooks/exhaustive-deps

  const sizeOptions = useMemo(() => {
    if (!order || !priceBook.Headstones) return [];
    return priceBook.Headstones.filter((h) => h.type === order.hsType).map(
      (h) => h.size,
    );
  }, [order?.hsType, priceBook.Headstones]); // eslint-disable-line react-hooks/exhaustive-deps

  const onHsTypeChange = (type: string) => {
    if (!order) return;
    const next = { ...order, hsType: type, hsSize: "", hsSellPrice: 0, hsCostPrice: 0 };
    setOrder(recalcTotals(next));
  };

  const onHsSizeChange = (size: string) => {
    if (!order) return;
    const row = priceBook.Headstones?.find(
      (h) => h.type === order.hsType && h.size === size,
    );
    setOrder(
      recalcTotals({
        ...order,
        hsSize: size,
        hsSellPrice: row?.sell || 0,
        hsCostPrice: row?.cost || 0,
      }),
    );
  };

  const onHsColourChange = (colourName: string) => {
    if (!order) return;
    const row = priceBook.Headstone_Colours?.find((c) => c.name === colourName);
    // hsColourAdj is a separate sell-side adjustment field on the order
    // (the Apps Script preserves it as its own column). Cost-side
    // adjustment is left for manual entry — auto-applying it would
    // double-count whenever size changes after colour is picked.
    setOrder(
      recalcTotals({
        ...order,
        hsColour: colourName,
        hsColourAdj: row?.sellAdj || 0,
      }),
    );
  };

  const onSurroundChange = (type: string, granite: boolean) => {
    if (!order) return;
    const row = priceBook.Surrounds?.find((s) => s.type === type);
    if (!row) {
      setOrder(
        recalcTotals({ ...order, surroundType: type, surroundGranite: granite }),
      );
      return;
    }
    setOrder(
      recalcTotals({
        ...order,
        surroundType: type,
        surroundGranite: granite,
        surroundSellPrice:
          (row.baseSell || 0) + (granite ? row.graniteSellAdd || 0 : 0),
        surroundCostPrice:
          (row.baseCost || 0) + (granite ? row.graniteCostAdd || 0 : 0),
      }),
    );
  };

  const onStoneChange = (type: string) => {
    if (!order) return;
    const row = priceBook.Stones?.find((s) => s.type === type);
    if (!row) {
      setOrder(recalcTotals({ ...order, stoneType: type }));
      return;
    }
    const hasSurround = !!order.surroundType;
    setOrder(
      recalcTotals({
        ...order,
        stoneType: type,
        stoneSellPrice: row.sell || 0,
        stoneCostPrice: hasSurround
          ? row.withSurroundCost || 0
          : row.standaloneCost || 0,
      }),
    );
  };

  const toggleAccessory = (name: string) => {
    if (!order) return;
    const has = order.accessories.includes(name);
    const next = has
      ? order.accessories.filter((a) => a !== name)
      : [...order.accessories, name];
    const sumSell = (priceBook.Accessories || [])
      .filter((a) => next.includes(a.name))
      .reduce((s, a) => s + (a.sell || 0), 0);
    const sumCost = (priceBook.Accessories || [])
      .filter((a) => next.includes(a.name))
      .reduce((s, a) => s + (a.cost || 0), 0);
    setOrder(
      recalcTotals({
        ...order,
        accessories: next,
        accessoriesSellPrice: sumSell,
        accessoriesCostPrice: sumCost,
      }),
    );
  };

  const onCemeteryChange = (loc: string) => {
    if (!order) return;
    const row = priceBook.Cemetery_Fees?.find((c) => c.location === loc);
    setOrder(
      recalcTotals({ ...order, cemetery: loc, cemeteryFee: row?.fee || 0 }),
    );
  };

  // ---- ACTIONS ----

  const save = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await fetch("/api/headstones/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: { ...order, id: order.orderId } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setToast({ kind: "success", text: "Saved." });
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteOrder = async () => {
    if (!order) return;
    if (
      !window.confirm(
        `Delete order for ${order.deceasedName || "(no name)"}? This removes it from the tracker permanently.`,
      )
    )
      return;
    setBusyAction("delete");
    try {
      const res = await fetch(
        `/api/headstones/orders?id=${encodeURIComponent(order.orderId)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      router.push("/headstones");
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const generatePdf = async (alsoStore: boolean, alsoEmail: boolean) => {
    if (!order) return;
    setBusyAction(alsoEmail ? "email" : alsoStore ? "store" : "pdf");
    try {
      // Save first so the Apps Script row exists before we attach a file.
      await save();
      const mod = await import("@/lib/headstonePdf");
      const lines = buildPdfLines(order);
      const { base64, filename, bytes } = await mod.generateHeadstonePdf({
        orderId: order.orderId,
        ref: shortRef(order.orderId),
        customerName: order.customerName,
        address: order.address,
        deceasedName: order.deceasedName,
        cemetery: order.cemetery,
        graveNumber: order.graveNumber,
        lines,
        totalSell: order.totalSellPrice,
        depositPaid: order.depositPaid,
        inscriptionDesign: order.inscriptionDesign,
      });
      // Always trigger a download for the staff member
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (alsoStore || alsoEmail) {
        const storeRes = await fetch("/api/headstones/store-estimate-pdf", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: order.orderId,
            ref: shortRef(order.orderId),
            pdfBase64: base64,
          }),
        });
        if (!storeRes.ok) {
          const d = await storeRes.json().catch(() => ({}));
          throw new Error(d?.error || `Drive store failed (HTTP ${storeRes.status})`);
        }
      }
      if (alsoEmail) {
        if (!order.email) {
          setToast({
            kind: "error",
            text: "PDF generated but no customer email on file — couldn't send.",
          });
          return;
        }
        const proofUrl = `${window.location.origin}/p/proof/${encodeURIComponent(order.orderId)}`;
        const emRes = await fetch("/api/headstones/send-estimate-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: order.email,
            customerName: order.customerName,
            ref: shortRef(order.orderId),
            pdfBase64: base64,
            proofUrl,
          }),
        });
        const emData = await emRes.json().catch(() => ({}));
        if (!emRes.ok)
          throw new Error(emData?.error || `Email failed (HTTP ${emRes.status})`);
        setToast({ kind: "success", text: `Estimate emailed to ${order.email}.` });
      } else if (alsoStore) {
        setToast({ kind: "success", text: "Estimate saved to Drive." });
      } else {
        setToast({ kind: "success", text: "Estimate PDF downloaded." });
      }
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "PDF generation failed",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const createPaymentLink = async () => {
    if (!order) return;
    const remainingBalance = Math.max(
      0,
      order.totalSellPrice - order.depositPaid,
    );
    const defaultDeposit =
      remainingBalance > 0
        ? Math.round(order.totalSellPrice * 50) / 100 // 50% of total in £
        : 0;
    const amtStr = window.prompt(
      `Payment amount in £ (default = 50% deposit = ${formatGBP(defaultDeposit)})`,
      defaultDeposit.toFixed(2),
    );
    if (!amtStr) return;
    const amt = parseFloat(amtStr);
    if (!isFinite(amt) || amt < 1) {
      setToast({ kind: "error", text: "Amount must be £1 or more." });
      return;
    }
    setBusyAction("payment-link");
    try {
      const res = await fetch("/api/headstones/payment-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.orderId,
          customerName: order.customerName,
          deceasedName: order.deceasedName,
          orderRef: shortRef(order.orderId),
          amountPence: Math.round(amt * 100),
          totalSellPrice: order.totalSellPrice,
          previousDeposit: order.depositPaid,
          paymentType: order.depositPaid > 0 ? "balance" : "deposit",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url)
        throw new Error(data?.error || `HTTP ${res.status}`);
      // Stamp the link onto the order so the staff member sees it
      update("stripeLinkId", data.url);
      update("stripePaymentUrl", data.url);
      setToast({ kind: "success", text: "Payment link created — opening…" });
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Payment link failed",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const notifyMason = async () => {
    if (!order) return;
    if (
      order.masonNotifiedAt &&
      !window.confirm(
        `Mason was already notified at ${order.masonNotifiedAt}. Send again?`,
      )
    )
      return;
    setBusyAction("notify-mason");
    try {
      const res = await fetch("/api/headstones/notify-mason", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.orderId,
          force: !!order.masonNotifiedAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setToast({ kind: "success", text: "Mason notified." });
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Notify failed",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (loading || !order) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-mist-400 shadow-soft">
        {error ? error : "Loading order…"}
      </p>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/headstones"
            className="text-xs text-mist-400 underline-offset-2 hover:underline"
          >
            ← Back to dashboard
          </Link>
          <h1 className="heading-serif text-3xl text-navy-900 sm:text-4xl">
            {order.deceasedName || order.customerName || "New memorial order"}
          </h1>
          <p className="mt-1 font-mono text-xs text-mist-400">
            Ref {shortRef(order.orderId)} · created {order.created || "now"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="field-input"
            value={order.status}
            onChange={(e) => update("status", e.target.value as HeadstoneStatus)}
          >
            {STATUS_PIPELINE.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Customer */}
      <Section title="Customer">
        <Grid>
          <Field label="Full name">
            <input
              className="field-input"
              value={order.customerName}
              onChange={(e) => update("customerName", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className="field-input"
              value={order.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              className="field-input"
              type="email"
              value={order.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
          <Field label="Address" wide>
            <textarea
              className="field-input"
              rows={2}
              value={order.address}
              onChange={(e) => update("address", e.target.value)}
            />
          </Field>
        </Grid>
      </Section>

      {/* Deceased */}
      <Section title="Deceased">
        <Grid>
          <Field label="Full name">
            <input
              className="field-input"
              value={order.deceasedName}
              onChange={(e) => update("deceasedName", e.target.value)}
            />
          </Field>
          <Field label="Grave number">
            <input
              className="field-input"
              value={order.graveNumber}
              onChange={(e) => update("graveNumber", e.target.value)}
            />
          </Field>
          <Field label="Date of birth">
            <input
              className="field-input"
              type="date"
              value={toDateInput(order.deceasedDob)}
              onChange={(e) => update("deceasedDob", e.target.value)}
            />
          </Field>
          <Field label="Date of passing">
            <input
              className="field-input"
              type="date"
              value={toDateInput(order.deceasedDod)}
              onChange={(e) => update("deceasedDod", e.target.value)}
            />
          </Field>
        </Grid>
      </Section>

      {/* Headstone */}
      <Section title="Headstone">
        <Grid>
          <Field label="Type">
            <select
              className="field-input"
              value={order.hsType}
              onChange={(e) => onHsTypeChange(e.target.value)}
            >
              <option value="">— choose —</option>
              {dedupe(priceBook.Headstones?.map((h) => h.type) || []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <select
              className="field-input"
              value={order.hsSize}
              onChange={(e) => onHsSizeChange(e.target.value)}
              disabled={!order.hsType}
            >
              <option value="">— choose —</option>
              {sizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Colour">
            <select
              className="field-input"
              value={order.hsColour}
              onChange={(e) => onHsColourChange(e.target.value)}
            >
              <option value="">— choose —</option>
              {(priceBook.Headstone_Colours || []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Finish">
            <input
              className="field-input"
              value={order.hsFinish}
              onChange={(e) => update("hsFinish", e.target.value)}
              placeholder="e.g. Polished front"
            />
          </Field>
          <Field label="Sell £">
            <input
              className="field-input"
              type="number"
              value={order.hsSellPrice}
              onChange={(e) => update("hsSellPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Cost £">
            <input
              className="field-input"
              type="number"
              value={order.hsCostPrice}
              onChange={(e) => update("hsCostPrice", Number(e.target.value))}
            />
          </Field>
        </Grid>
      </Section>

      {/* Surround / Stone */}
      <Section title="Surround & stone">
        <Grid>
          <Field label="Surround">
            <select
              className="field-input"
              value={order.surroundType}
              onChange={(e) =>
                onSurroundChange(e.target.value, order.surroundGranite)
              }
            >
              <option value="">— none —</option>
              {(priceBook.Surrounds || []).map((s) => (
                <option key={s.type} value={s.type}>
                  {s.type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Granite upgrade">
            <label className="flex items-center gap-2 pt-2 text-sm">
              <input
                type="checkbox"
                checked={order.surroundGranite}
                onChange={(e) =>
                  onSurroundChange(order.surroundType, e.target.checked)
                }
              />
              Yes
            </label>
          </Field>
          <Field label="Stone / chippings">
            <select
              className="field-input"
              value={order.stoneType}
              onChange={(e) => onStoneChange(e.target.value)}
            >
              <option value="">— none —</option>
              {(priceBook.Stones || []).map((s) => (
                <option key={s.type} value={s.type}>
                  {s.type}
                </option>
              ))}
            </select>
          </Field>
          <div />
          <Field label="Surround sell £">
            <input
              className="field-input"
              type="number"
              value={order.surroundSellPrice}
              onChange={(e) => update("surroundSellPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Surround cost £">
            <input
              className="field-input"
              type="number"
              value={order.surroundCostPrice}
              onChange={(e) => update("surroundCostPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Stone sell £">
            <input
              className="field-input"
              type="number"
              value={order.stoneSellPrice}
              onChange={(e) => update("stoneSellPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Stone cost £">
            <input
              className="field-input"
              type="number"
              value={order.stoneCostPrice}
              onChange={(e) => update("stoneCostPrice", Number(e.target.value))}
            />
          </Field>
        </Grid>
      </Section>

      {/* Accessories */}
      <Section title="Accessories">
        {priceBook.Accessories && priceBook.Accessories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {priceBook.Accessories.map((a) => {
              const on = order.accessories.includes(a.name);
              return (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => toggleAccessory(a.name)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (on
                      ? "border-navy-700 bg-navy-700 text-white"
                      : "border-mist-200 bg-white text-navy-800 hover:border-navy-400")
                  }
                >
                  {a.name} · {formatGBP(a.sell)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-mist-400">No accessories in price book.</p>
        )}
        <p className="mt-3 text-xs text-mist-400">
          Selected: {order.accessories.length} · sell {formatGBP(order.accessoriesSellPrice)}
          {" · "}cost {formatGBP(order.accessoriesCostPrice)}
        </p>
      </Section>

      {/* Inscription */}
      <Section title="Inscription">
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={order.inscriptionType === "new"}
              onChange={() => update("inscriptionType", "new")}
            />
            New inscription
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={order.inscriptionType === "additional"}
              onChange={() => update("inscriptionType", "additional")}
            />
            Additional on existing
          </label>
          <span className="ml-auto text-xs text-mist-400">
            {order.inscriptionLines} letters · sell {formatGBP(order.inscriptionSellPrice)}
          </span>
        </div>
        <InscriptionDesigner
          value={order.inscriptionDesign || withText(DEFAULT_INSCRIPTION_DESIGN, order.inscriptionText)}
          onChange={(d) => {
            // Keep the canonical inscriptionText synced from the designer.
            setOrder((prev) =>
              prev
                ? recalcTotals({ ...prev, inscriptionDesign: d, inscriptionText: d.text })
                : prev,
            );
          }}
        />
      </Section>

      {/* Cemetery / services */}
      <Section title="Cemetery & additional services">
        <Grid>
          <Field label="Cemetery / location">
            <select
              className="field-input"
              value={order.cemetery}
              onChange={(e) => onCemeteryChange(e.target.value)}
            >
              <option value="">— none —</option>
              {(priceBook.Cemetery_Fees || []).map((c) => (
                <option key={c.location} value={c.location}>
                  {c.location}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cemetery fee £">
            <input
              className="field-input"
              type="number"
              value={order.cemeteryFee}
              onChange={(e) => update("cemeteryFee", Number(e.target.value))}
            />
          </Field>
          <Field label="Additional services">
            <input
              className="field-input"
              value={order.additionalServices}
              onChange={(e) => update("additionalServices", e.target.value)}
              placeholder="e.g. Reconcrete Full Grave"
            />
          </Field>
          <div />
          <Field label="Services sell £">
            <input
              className="field-input"
              type="number"
              value={order.servicesSellPrice}
              onChange={(e) => update("servicesSellPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Services cost £">
            <input
              className="field-input"
              type="number"
              value={order.servicesCostPrice}
              onChange={(e) => update("servicesCostPrice", Number(e.target.value))}
            />
          </Field>
        </Grid>
      </Section>

      {/* Pricing summary */}
      <Section title="Pricing summary">
        <Grid>
          <Field label="Total sell £">
            <input
              className="field-input bg-mist-100"
              type="number"
              value={Math.round(order.totalSellPrice * 100) / 100}
              readOnly
            />
          </Field>
          <Field label="Total cost £">
            <input
              className="field-input bg-mist-100"
              type="number"
              value={Math.round(order.totalCostPrice * 100) / 100}
              readOnly
            />
          </Field>
          <Field label="Profit margin">
            <input
              className="field-input bg-mist-100"
              value={`${formatGBP(order.profitMargin)} · ${order.marginPercentage.toFixed(1)}%`}
              readOnly
            />
          </Field>
          <Field label="Deposit paid £">
            <input
              className="field-input"
              type="number"
              value={order.depositPaid}
              onChange={(e) => update("depositPaid", Number(e.target.value))}
            />
          </Field>
          <Field label="Balance due £">
            <input
              className="field-input bg-mist-100"
              value={formatGBP(order.balanceDue)}
              readOnly
            />
          </Field>
          <Field label="Payment status">
            <select
              className="field-input"
              value={order.paymentStatus}
              onChange={(e) => update("paymentStatus", e.target.value)}
            >
              <option value="Unpaid">Unpaid</option>
              <option value="Part Paid">Part Paid</option>
              <option value="Paid">Paid</option>
            </select>
          </Field>
        </Grid>
        {order.stripePaymentUrl && (
          <p className="mt-3 text-xs text-mist-400">
            Stripe link: {" "}
            <a
              href={order.stripePaymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {order.stripePaymentUrl}
            </a>
          </p>
        )}
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <Grid>
          <Field label="General notes" wide>
            <textarea
              className="field-input"
              rows={3}
              value={order.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
          <Field label="Mason notes" wide>
            <textarea
              className="field-input"
              rows={3}
              value={order.masonNotes}
              onChange={(e) => update("masonNotes", e.target.value)}
            />
          </Field>
        </Grid>
      </Section>

      {/* Workflow / actions */}
      <Section title="Workflow">
        <Grid>
          <Field label="Proof date">
            <input
              className="field-input"
              type="date"
              value={toDateInput(order.proofDate)}
              onChange={(e) => update("proofDate", e.target.value)}
            />
          </Field>
          <Field label="Proof approved">
            <label className="flex items-center gap-2 pt-2 text-sm">
              <input
                type="checkbox"
                checked={order.artworkApproved}
                onChange={(e) => update("artworkApproved", e.target.checked)}
              />
              Yes
            </label>
          </Field>
          <Field label="Production start">
            <input
              className="field-input"
              type="date"
              value={toDateInput(order.productionDate)}
              onChange={(e) => update("productionDate", e.target.value)}
            />
          </Field>
          <Field label="Install date">
            <input
              className="field-input"
              type="date"
              value={toDateInput(order.installDate)}
              onChange={(e) => update("installDate", e.target.value)}
            />
          </Field>
        </Grid>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busyAction !== null}
            onClick={() => generatePdf(false, false)}
          >
            {busyAction === "pdf" ? "Working…" : "Download estimate PDF"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busyAction !== null}
            onClick={() => generatePdf(true, false)}
          >
            {busyAction === "store" ? "Working…" : "Save estimate to Drive"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busyAction !== null}
            onClick={() => generatePdf(true, true)}
          >
            {busyAction === "email" ? "Working…" : "Email estimate to customer"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busyAction !== null}
            onClick={createPaymentLink}
          >
            {busyAction === "payment-link" ? "Working…" : "Create payment link"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busyAction !== null}
            onClick={notifyMason}
          >
            {busyAction === "notify-mason" ? "Working…" : "Notify mason"}
          </button>
          <Link
            href={`/p/proof/${encodeURIComponent(order.orderId)}`}
            target="_blank"
            className="btn-secondary"
          >
            Open public proof page ↗
          </Link>
          <button
            type="button"
            className="ml-auto rounded-md px-2.5 py-1 text-xs text-red-600 hover:text-red-800"
            disabled={busyAction !== null}
            onClick={deleteOrder}
          >
            Delete order
          </button>
        </div>
      </Section>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-mist-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-navy-800">
            <span className="font-semibold">Total</span> {formatGBP(order.totalSellPrice)}
            {" · "}Balance {formatGBP(order.balanceDue)}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={
            "fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg " +
            (toast.kind === "success" ? "bg-navy-700 text-white" : "bg-red-600 text-white")
          }
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---- helpers ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-soft">
      <h2 className="heading-serif text-xl text-navy-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function toDateInput(v: string | undefined): string {
  if (!v) return "";
  // Accept dd/mm/yyyy from Sheets or ISO from forms — coerce to yyyy-mm-dd.
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return "";
}

function withText(d: InscriptionDesign, text: string): InscriptionDesign {
  return text && text !== d.text ? { ...d, text } : d;
}

// The Apps Script's mapSheetOrderToTracker returns most fields as their
// proper types already, but a few sneak through as strings (numbers
// stored in the sheet). Coerce defensively so totals math doesn't NaN.
function normalizeIncoming(o: Record<string, unknown>): HeadstoneOrder {
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return isFinite(n) ? n : 0;
  };
  const str = (v: unknown) => (v == null ? "" : String(v));
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const bool = (v: unknown) => v === true || v === "true" || v === "Yes";

  return {
    orderId: str(o.orderId),
    orderRef: str(o.orderRef),
    created: str(o.created),
    lastUpdated: str(o.lastUpdated),
    orderDate: str(o.orderDate),
    status: ((str(o.status) || "Enquiry") as HeadstoneStatus),
    paymentStatus: str(o.paymentStatus) || "Unpaid",
    customerName: str(o.customerName),
    phone: str(o.phone),
    email: str(o.email),
    address: str(o.address),
    deceasedName: str(o.deceasedName),
    deceasedDob: str(o.deceasedDob),
    deceasedDod: str(o.deceasedDod),
    hsType: str(o.hsType),
    hsSize: str(o.hsSize),
    hsColour: str(o.hsColour),
    hsColourAdj: num(o.hsColourAdj),
    hsFinish: str(o.hsFinish),
    hsSellPrice: num(o.hsSellPrice),
    hsCostPrice: num(o.hsCostPrice),
    surroundType: str(o.surroundType),
    surroundGranite: bool(o.surroundGranite),
    surroundSellPrice: num(o.surroundSellPrice),
    surroundCostPrice: num(o.surroundCostPrice),
    stoneType: str(o.stoneType),
    stoneSellPrice: num(o.stoneSellPrice),
    stoneCostPrice: num(o.stoneCostPrice),
    accessories: arr(o.accessories),
    accessoriesSellPrice: num(o.accessoriesSellPrice),
    accessoriesCostPrice: num(o.accessoriesCostPrice),
    inscriptionType:
      (o.inscriptionType as string) === "additional" ? "additional" : "new",
    inscriptionText: str(o.inscriptionText),
    inscriptionLines: num(o.inscriptionLines),
    inscriptionStyle: str(o.inscriptionStyle),
    inscriptionColour: str(o.inscriptionColour) || "Gold",
    inscriptionSellPrice: num(o.inscriptionSellPrice),
    inscriptionCostPrice: num(o.inscriptionCostPrice),
    inscriptionDesign: (o.inscriptionDesign as InscriptionDesign | null) || null,
    cemetery: str(o.cemetery),
    cemeteryFee: num(o.cemeteryFee),
    graveNumber: str(o.graveNumber),
    additionalServices: str(o.additionalServices),
    servicesSellPrice: num(o.servicesSellPrice),
    servicesCostPrice: num(o.servicesCostPrice),
    totalSellPrice: num(o.totalSellPrice),
    totalCostPrice: num(o.totalCostPrice),
    profitMargin: num(o.profitMargin),
    marginPercentage: num(o.marginPercentage),
    depositPaid: num(o.depositPaid),
    balanceDue: num(o.balanceDue),
    proofDate: str(o.proofDate),
    artworkApproved: bool(o.artworkApproved),
    productionDate: str(o.productionDate),
    installDate: str(o.installDate),
    artworkNotes: str(o.artworkNotes),
    notes: str(o.notes),
    masonNotes: str(o.masonNotes),
    archived: bool(o.archived),
    stripeLinkId: str(o.stripeLinkId),
    stripePaymentUrl: str(o.stripePaymentUrl),
    masonNotifiedAt: str(o.masonNotifiedAt),
  };
}

function buildPdfLines(o: HeadstoneOrder) {
  const lines: { label: string; detail?: string; amount: number }[] = [];
  if (o.hsType || o.hsSize) {
    lines.push({
      label: "Headstone",
      detail: [o.hsType, o.hsSize, o.hsColour, o.hsFinish].filter(Boolean).join(" · "),
      amount: (o.hsSellPrice || 0) + (o.hsColourAdj || 0),
    });
  }
  if (o.surroundType) {
    lines.push({
      label: "Surround",
      detail: o.surroundType + (o.surroundGranite ? " · Granite upgrade" : ""),
      amount: o.surroundSellPrice || 0,
    });
  }
  if (o.stoneType) {
    lines.push({
      label: "Stone / chippings",
      detail: o.stoneType,
      amount: o.stoneSellPrice || 0,
    });
  }
  if (o.accessories.length) {
    lines.push({
      label: "Accessories",
      detail: o.accessories.join(", "),
      amount: o.accessoriesSellPrice || 0,
    });
  }
  if (o.inscriptionSellPrice || o.inscriptionText) {
    lines.push({
      label:
        o.inscriptionType === "additional"
          ? "Inscription (additional)"
          : "Inscription",
      detail: `${o.inscriptionLines} letters`,
      amount: o.inscriptionSellPrice || 0,
    });
  }
  if (o.cemetery) {
    lines.push({
      label: "Cemetery fee",
      detail: o.cemetery,
      amount: o.cemeteryFee || 0,
    });
  }
  if (o.additionalServices) {
    lines.push({
      label: "Additional services",
      detail: o.additionalServices,
      amount: o.servicesSellPrice || 0,
    });
  }
  return lines;
}
