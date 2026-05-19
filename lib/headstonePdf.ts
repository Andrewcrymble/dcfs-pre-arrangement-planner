import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawInscription, type InscriptionDesign } from "@/components/InscriptionDesigner";

// Headstone estimate PDF — itemized order summary plus an embedded
// preview of the inscription design. Mirrors the brand palette of
// lib/pdf.ts but kept deliberately simpler (single-domain memorial
// order, no financing options, no addressed-letter cover page).

const NAVY: [number, number, number] = [40, 40, 40];
const SLATE: [number, number, number] = [110, 110, 110];
const BRAND_GREEN: [number, number, number] = [69, 118, 28];

const LETTERHEAD_TOP_SAFE = 180;
const LETTERHEAD_BOTTOM_SAFE = 760;

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

function drawLetterhead(
  doc: jsPDF,
  img: HTMLImageElement | null,
  pageWidth: number,
  pageHeight: number,
) {
  if (!img) return;
  doc.addImage(img, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
}

export interface HeadstonePdfLine {
  label: string;
  detail?: string;
  amount: number;
}

export interface HeadstoneOrderForPdf {
  orderId: string;
  ref: string;
  customerName: string;
  address?: string;
  deceasedName: string;
  cemetery?: string;
  graveNumber?: string;
  lines: HeadstonePdfLine[];
  totalSell: number;
  depositPaid: number;
  inscriptionDesign?: InscriptionDesign | null;
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// Render the inscription onto an offscreen canvas, return a PNG data
// URL. Needs an already-loaded shape image — caller waits for it.
async function inscriptionPreviewDataUrl(
  design: InscriptionDesign,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = `/headstones/${design.shape}.png`;
  });
  if (!img) return null;
  const canvas = document.createElement("canvas");
  const maxW = 560;
  const scale = Math.min(maxW / img.width, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  drawInscription(canvas, img, design);
  return canvas.toDataURL("image/png");
}

export async function generateHeadstonePdf(
  order: HeadstoneOrderForPdf,
): Promise<{ bytes: Uint8Array; base64: string; filename: string }> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  const letterhead = await loadLetterhead();
  drawLetterhead(doc, letterhead, pageWidth, pageHeight);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Header: customer/deceased block + ref/date block
  let y = LETTERHEAD_TOP_SAFE + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text("Memorial estimate", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  doc.text(`Our reference: ${order.ref}`, pageWidth - margin, LETTERHEAD_TOP_SAFE + 10, {
    align: "right",
  });
  doc.text(dateStr, pageWidth - margin, LETTERHEAD_TOP_SAFE + 24, {
    align: "right",
  });

  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  if (order.customerName) {
    doc.text(order.customerName, margin, y);
    y += 14;
  }
  if (order.address) {
    const addrLines = order.address
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of addrLines) {
      const wrapped = doc.splitTextToSize(line, contentWidth - 220);
      doc.text(wrapped, margin, y);
      y += 14 * Math.max(1, wrapped.length);
    }
  }
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  doc.text(`In memory of: ${order.deceasedName || "—"}`, margin, y);
  y += 14;
  if (order.cemetery) {
    doc.text(`Cemetery: ${order.cemetery}${order.graveNumber ? ` · Grave ${order.graveNumber}` : ""}`, margin, y);
    y += 14;
  }
  y += 10;

  // Inscription preview image (if design present)
  if (order.inscriptionDesign) {
    const dataUrl = await inscriptionPreviewDataUrl(order.inscriptionDesign);
    if (dataUrl) {
      const w = Math.min(contentWidth, 280);
      // Estimate height assuming a portrait aspect ratio; jsPDF rescales
      // the image to whatever we ask for, so a 1.4 aspect is safe for the
      // headstone shapes we ship.
      const h = w * 1.4;
      if (y + h > LETTERHEAD_BOTTOM_SAFE - 200) {
        // not enough room — push to bottom of the price table later
      } else {
        doc.addImage(dataUrl, "PNG", pageWidth - margin - w, y, w, h, undefined, "FAST");
      }
    }
  }

  // Itemized table (kept on the left side so it sits beside the
  // inscription preview when both are present)
  const tableWidth = order.inscriptionDesign ? contentWidth - 300 : contentWidth;
  const visibleLines = order.lines.filter((l) => l.amount !== 0 || l.label);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: pageWidth - margin - tableWidth },
    tableWidth,
    head: [["Item", "£"]],
    body: visibleLines.map((l) => [
      l.detail ? `${l.label}\n${l.detail}` : l.label,
      formatGBP(l.amount),
    ]),
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: "right", cellWidth: 70 } },
    theme: "grid",
  });

  // jspdf-autotable stamps the next y on doc.lastAutoTable
  // (typed as any since the type defs don't surface it on every version).
  const lastY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y;
  let endY = lastY + 18;

  // Totals box: total / deposit / balance
  const boxHeight = 80;
  if (endY + boxHeight > LETTERHEAD_BOTTOM_SAFE) {
    doc.addPage();
    drawLetterhead(doc, letterhead, pageWidth, pageHeight);
    endY = LETTERHEAD_TOP_SAFE + 10;
  }

  doc.setFillColor(...BRAND_GREEN);
  doc.rect(margin, endY, contentWidth, boxHeight, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total", margin + 14, endY + 22);
  doc.setFontSize(15);
  doc.text(formatGBP(order.totalSell), pageWidth - margin - 14, endY + 22, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Deposit received: ${formatGBP(order.depositPaid)}`, margin + 14, endY + 42);
  const balance = Math.max(0, order.totalSell - order.depositPaid);
  doc.text(
    `Balance outstanding: ${formatGBP(balance)}`,
    pageWidth - margin - 14,
    endY + 42,
    { align: "right" },
  );
  doc.setFontSize(9);
  doc.text(
    "A 50% deposit is requested to schedule the work; the balance is due on installation.",
    margin + 14,
    endY + 64,
  );

  // jsPDF v2 returns ArrayBuffer; coerce to Uint8Array for the caller.
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const base64 = doc.output("datauristring");
  const filename = `Memorial_Estimate_${order.ref}.pdf`;
  return { bytes, base64, filename };
}
