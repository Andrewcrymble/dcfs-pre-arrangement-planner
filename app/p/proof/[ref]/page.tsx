"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  drawInscription,
  DEFAULT_INSCRIPTION_DESIGN,
  type InscriptionDesign,
} from "@/components/InscriptionDesigner";

// Customer-facing proof page. Public route (whitelisted in middleware)
// — opens straight from an email link without a login. Shows order
// summary, inscription preview, and approve / request-changes buttons.
//
// Mirrors the existing dcfs-memorial-tracker proof.html: clean
// presentation, deceased name + headstone shape, single tap to approve.

interface Proof {
  orderId: string;
  orderRef: string;
  customerFirstName: string;
  deceasedName: string;
  hsType: string;
  hsSize: string;
  hsColour: string;
  inscriptionText: string;
  inscriptionColour: string;
  inscriptionDesign: InscriptionDesign | null;
  proofStatus: "pending" | "sent" | "approved" | "changes_requested" | string;
  totalSellPrice: number;
  depositPaid: number;
  depositAmount: number;
  stripePaymentUrl: string;
  balanceDue: number;
  estimatePdfUrl: string;
  proofFileUrl: string;
  proofFileName: string;
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(isFinite(n) ? n : 0);
}

// Map the hsType to a public/headstones/*.png filename. Falls back to
// /headstones/headstone.png if the type isn't one we have an image for.
function shapeImageFor(hsType: string): string {
  const k = (hsType || "").toLowerCase();
  if (k.includes("ogee")) return "/headstones/ogee.png";
  if (k.includes("half") && k.includes("dens")) return "/headstones/halfdensmore.png";
  if (k.includes("dens")) return "/headstones/densmore.png";
  if (k.includes("g3")) return "/headstones/g3.png";
  if (k.includes("murphy")) return "/headstones/murphy.png";
  return "/headstones/headstone.png";
}

export default function ProofPage() {
  const params = useParams<{ ref: string }>();
  const orderId = params?.ref || "";
  const [proof, setProof] = useState<Proof | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"approved" | "changes" | null>(null);
  const [changesText, setChangesText] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/headstones/proof-data?id=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setProof(data?.proof || null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load proof");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Render inscription preview onto the canvas once the proof + image
  // are both ready. If a Drive-hosted proof file URL is present we
  // surface that as a fallback link rather than trying to render it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !proof) return;
    const design: InscriptionDesign = proof.inscriptionDesign || {
      ...DEFAULT_INSCRIPTION_DESIGN,
      text: proof.inscriptionText || "",
    };
    // Prefer the design's stored shape (set in the editor); fall back
    // to fuzzy-matching the headstone type for legacy orders that
    // never went through the new designer.
    const shapeUrl = proof.inscriptionDesign?.shape
      ? `/headstones/${proof.inscriptionDesign.shape}.png`
      : shapeImageFor(proof.hsType);
    const img = new Image();
    img.onload = () => {
      const maxW = 480;
      const scale = Math.min(maxW / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      drawInscription(canvas, img, design);
    };
    img.src = shapeUrl;
  }, [proof]);

  const submit = async (approved: boolean) => {
    if (!proof) return;
    if (!approved && !changesText.trim()) {
      window.alert("Please describe what you'd like changed.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/headstones/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: proof.orderId,
          approved,
          message: approved ? "" : changesText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDone(approved ? "approved" : "changes");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-mist-400 shadow-soft">
        Loading your proof…
      </p>
    );
  }

  if (error || !proof) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-red-700 shadow-soft">
        {error || "Proof not found. Please contact the office for help."}
      </p>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-soft">
        <h1 className="heading-serif text-3xl text-navy-900">
          {done === "approved" ? "Thank you" : "Got it"}
        </h1>
        <p className="mt-3 text-navy-800">
          {done === "approved"
            ? "Your approval has been recorded. The stonemason will now begin work on your memorial."
            : "We've passed your change request on to the office. We'll be in touch shortly."}
        </p>
        {done === "approved" && proof.balanceDue > 0 && proof.stripePaymentUrl && (
          <a
            href={proof.stripePaymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-5 inline-block"
          >
            Pay deposit · {formatGBP(proof.depositAmount)}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-6 text-center shadow-soft">
        <p className="text-xs uppercase tracking-[0.2em] text-mist-400">
          Proof for review
        </p>
        <h1 className="heading-serif mt-1 text-3xl text-navy-900">
          {proof.deceasedName || "Memorial proof"}
        </h1>
        <p className="mt-1 text-sm text-mist-400">Reference {proof.orderRef}</p>
        {proof.customerFirstName && (
          <p className="mt-4 text-navy-800">
            Hello {proof.customerFirstName}, please review your memorial design
            below. If everything looks right, tap{" "}
            <strong>Approve</strong>. Otherwise tap{" "}
            <strong>Request changes</strong> and tell us what to amend.
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <p className="field-label">Your design</p>
        <div className="mt-2 flex flex-col items-center gap-3">
          {proof.proofFileUrl ? (
            <a
              href={proof.proofFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-navy-700 underline-offset-2 hover:underline"
            >
              View detailed proof file ↗
            </a>
          ) : null}
          <canvas
            ref={canvasRef}
            className="max-w-full rounded-md shadow-soft"
            aria-label="Headstone inscription proof"
          />
        </div>
        {proof.hsType && (
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-navy-800 sm:grid-cols-3">
            <div>
              <span className="text-mist-400">Type:</span> {proof.hsType}
            </div>
            <div>
              <span className="text-mist-400">Size:</span> {proof.hsSize || "—"}
            </div>
            <div>
              <span className="text-mist-400">Colour:</span>{" "}
              {proof.hsColour || "—"}
            </div>
          </dl>
        )}
      </div>

      {proof.totalSellPrice > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <p className="field-label">Pricing</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-sm text-navy-800 sm:grid-cols-3">
            <div>
              <span className="text-mist-400">Total:</span>{" "}
              {formatGBP(proof.totalSellPrice)}
            </div>
            <div>
              <span className="text-mist-400">Deposit paid:</span>{" "}
              {formatGBP(proof.depositPaid)}
            </div>
            <div>
              <span className="text-mist-400">Balance:</span>{" "}
              {formatGBP(proof.balanceDue)}
            </div>
          </dl>
          {proof.estimatePdfUrl && (
            <a
              href={proof.estimatePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-navy-700 underline-offset-2 hover:underline"
            >
              View full estimate PDF ↗
            </a>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-soft">
        {changesOpen ? (
          <div>
            <label className="field-label">What would you like changed?</label>
            <textarea
              className="field-input"
              rows={4}
              value={changesText}
              onChange={(e) => setChangesText(e.target.value)}
              placeholder="e.g. Please change ‘1945 — 2024’ to ‘1945 — 2025’, and centre the bottom line."
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setChangesOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => submit(false)}
                disabled={submitting || !changesText.trim()}
              >
                {submitting ? "Sending…" : "Send change request"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => submit(true)}
              disabled={submitting}
            >
              {submitting ? "Working…" : "✓ Approve this proof"}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => setChangesOpen(true)}
              disabled={submitting}
            >
              Request changes
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-mist-400">
          By approving, you confirm the inscription, spelling, headstone style
          and pricing are correct. Manufacture will begin and changes after
          this point may incur an additional charge.
        </p>
      </div>
    </div>
  );
}
