import jsPDF from "jspdf";

// Burgundy / maroon accent — used for total + monthly payment highlights.
const BURGUNDY: [number, number, number] = [122, 31, 46];
const FOREST: [number, number, number] = [42, 71, 21];
const SLATE: [number, number, number] = [110, 110, 110];

let cachedLetterhead: HTMLImageElement | null = null;
async function loadLetterhead(): Promise<HTMLImageElement | null> {
  if (cachedLetterhead) return cachedLetterhead;
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cachedLetterhead = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = "/letterhead.png";
  });
}

export interface CalculatorInputs {
  planName: string;
  basePrice: number;
  termMonths: number;
  interestFreeMonths: number;
  apr: number; // fractional (0.06 = 6%)
  deposit: number;
}

export interface CalculatorResults {
  totalPayable: number;
  monthlyPayment: number;
  interestFreeAmount: number;
  remainingAfterIf: number;
  financeCharge: number;
}

// Equal-monthly amortisation: during the interest-free window M pays
// principal at no interest, then the remaining balance is amortised at
// the monthly rate over the post-IF window with the same M.
//   M = P·r / (1 + IF·r − (1+r)^−n)   where n = months − IF
export function calculate(inputs: CalculatorInputs): CalculatorResults {
  const principal = Math.max(0, inputs.basePrice - inputs.deposit);
  const term = Math.max(0, inputs.termMonths);
  const ifMonths = Math.min(Math.max(0, inputs.interestFreeMonths), term);
  const r = inputs.apr / 12;

  let monthlyPayment = 0;
  if (term > 0) {
    if (term <= ifMonths || r === 0) {
      monthlyPayment = principal / term;
    } else {
      const n = term - ifMonths;
      const denom = 1 + ifMonths * r - Math.pow(1 + r, -n);
      monthlyPayment = (principal * r) / denom;
    }
  }
  const totalPaid = monthlyPayment * term;
  const financeCharge = Math.max(0, totalPaid - principal);
  const totalPayable = inputs.basePrice + financeCharge - inputs.deposit;
  const interestFreeAmount = monthlyPayment * ifMonths;
  const remainingAfterIf = Math.max(0, totalPaid - interestFreeAmount);
  return {
    totalPayable,
    monthlyPayment,
    interestFreeAmount,
    remainingAfterIf,
    financeCharge,
  };
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const DISCLAIMER =
  "This calculator provides an estimate only. Payment terms, fees, and finance " +
  "options may vary. Please speak to our team for an accurate quotation.";

export async function generateCalculatorPdf(
  inputs: CalculatorInputs,
): Promise<void> {
  const r = calculate(inputs);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  const letterhead = await loadLetterhead();
  if (letterhead) {
    doc.addImage(letterhead, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  }

  let y = 200;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...FOREST);
  doc.text("Pre-arrangement Plan", margin, y);
  y += 22;
  doc.setFontSize(14);
  doc.setTextColor(...SLATE);
  doc.text("Instalment summary", margin, y);
  y += 28;

  // Plan name card
  doc.setFillColor(248, 246, 240); // cream
  doc.roundedRect(margin, y, contentWidth, 50, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...FOREST);
  doc.text(inputs.planName || "Pre-arrangement plan", margin + 16, y + 32);
  y += 70;

  // Detail rows
  const row = (label: string, value: string, opts: { highlight?: boolean } = {}) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(label, margin, y);
    if (opts.highlight) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...BURGUNDY);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
    }
    doc.text(value, margin + contentWidth, y, { align: "right" });
    y += 22;
  };

  const aprPct = inputs.apr * 100;
  const aprLabel = `${aprPct % 1 === 0 ? aprPct.toFixed(0) : aprPct.toFixed(2)}%`;

  row("Base plan price", fmt(inputs.basePrice));
  row("Payment format", `${inputs.termMonths} monthly instalments`);
  row("Interest-free period", `First ${inputs.interestFreeMonths} months interest free`);
  row("APR (after interest-free period)", aprLabel);
  row("Finance charge", fmt(r.financeCharge));
  if (inputs.deposit > 0) row("Deposit", `−${fmt(inputs.deposit)}`);

  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 18;

  row("Total amount payable", fmt(r.totalPayable), { highlight: true });
  row("Monthly payment", fmt(r.monthlyPayment), { highlight: true });

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, margin + contentWidth, y);
  y += 22;

  // Breakdown section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...FOREST);
  doc.text("Payment breakdown", margin, y);
  y += 18;

  row("Number of payments", String(inputs.termMonths));
  row("Monthly payment (incl. fees)", fmt(r.monthlyPayment));
  row("Paid during interest-free period", fmt(r.interestFreeAmount));
  row("Remaining after interest-free period", fmt(r.remainingAfterIf));
  row("Finance charge applied after interest-free period", fmt(r.financeCharge));

  // Disclaimer
  y += 14;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  const lines = doc.splitTextToSize(DISCLAIMER, contentWidth);
  doc.text(lines, margin, y);

  const safe = (inputs.planName || "plan")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .slice(0, 60);
  doc.save(`dcfs-instalment-${safe}.pdf`);
}
