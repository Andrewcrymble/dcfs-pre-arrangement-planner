import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FormState, SelectedLine } from "./types";
import { formatGBP } from "./sheets";
import { PDF_DISCLAIMER, totalsForLines, isDirectFuneralType } from "./estimate";

const NAVY: [number, number, number] = [86, 147, 32];
const GOLD: [number, number, number] = [47, 190, 212];
const SLATE: [number, number, number] = [90, 100, 80];

function formatPdfTimestamp(iso: string): string {
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

const CATEGORY_LABEL: Record<SelectedLine["category"], string> = {
  funeral_type: "Funeral type",
  service_choice: "Service",
  coffin: "Coffin",
  transport: "Transport",
  additional_service: "Additional service",
  disbursement: "Third-party / disbursement",
  discount: "Package discount",
  admin_fee: "Plan administration",
};

// Vertical safe zone inside the letterhead — content sits between these.
// Logo block ends ~y=170, contact band starts ~y=720 on A4 (842pt tall).
const LETTERHEAD_TOP_SAFE = 180;
const LETTERHEAD_BOTTOM_SAFE = 700;

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

export async function generateEstimatePdf(form: FormState, lines: SelectedLine[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  const letterhead = await loadLetterhead();
  drawLetterhead(doc, letterhead, pageWidth, pageHeight);

  // Helper that adds a new page AND re-stamps the letterhead on it
  const addPage = () => {
    doc.addPage();
    drawLetterhead(doc, letterhead, pageWidth, pageHeight);
  };

  // ---- Title
  let y = LETTERHEAD_TOP_SAFE;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text("Pre-Arranged Funeral Estimate", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Generated: ${dateStr}`, pageWidth - margin, y, { align: "right" });

  y += 14;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(margin, y, margin + contentWidth, y);

  // ---- Customer details
  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Customer details", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  y += 16;

  const detailLines: [string, string][] = [
    ["Name", form.customer.fullName || "—"],
    ["Telephone", form.customer.telephone || "—"],
    ["Email", form.customer.email || "—"],
    ["Address", form.customer.address || "—"],
    ["Preferred branch", form.customer.branch || "—"],
    ["Arrangement for", form.customer.arrangementFor || "—"],
  ];
  for (const [label, value] of detailLines) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(value, contentWidth - 110);
    doc.text(wrapped, margin + 110, y);
    y += 14 * Math.max(1, wrapped.length);
  }

  // ---- Itemised table
  const funeralRows = lines
    .filter((l) => l.category !== "disbursement")
    .map((l) => [
      CATEGORY_LABEL[l.category],
      l.item_name + (l.description ? `\n${l.description}` : ""),
      formatGBP(l.price),
    ]);

  const disbursementRows = lines
    .filter((l) => l.category === "disbursement")
    .map((l) => [
      CATEGORY_LABEL[l.category],
      l.item_name + (l.description ? `\n${l.description}` : ""),
      formatGBP(l.price),
    ]);

  const totals = totalsForLines(lines);

  y += 10;
  if (funeralRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Category", "Item", "Estimated cost"]],
      body: funeralRows,
      theme: "grid",
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      bodyStyles: { textColor: [40, 40, 40], fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 110 },
        2: { cellWidth: 90, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error autoTable adds lastAutoTable to the doc
    y = doc.lastAutoTable.finalY + 8;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.setFontSize(11);
    doc.text("Funeral services subtotal", margin, y + 12);
    doc.text(formatGBP(totals.funeralTotal), pageWidth - margin, y + 12, { align: "right" });
    y += 26;
  }

  if (disbursementRows.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Estimated third-party costs (disbursements)", margin, y + 4);
    y += 12;

    autoTable(doc, {
      startY: y,
      head: [["Category", "Item", "Estimated cost"]],
      body: disbursementRows,
      theme: "grid",
      headStyles: { fillColor: GOLD, textColor: 255, fontStyle: "bold" },
      bodyStyles: { textColor: [40, 40, 40], fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 110 },
        2: { cellWidth: 90, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error autoTable adds lastAutoTable to the doc
    y = doc.lastAutoTable.finalY + 8;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text(
      "These are estimated third-party costs and may change.",
      margin,
      y + 10,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Disbursements subtotal", margin, y + 26);
    doc.text(formatGBP(totals.disbursementsTotal), pageWidth - margin, y + 26, { align: "right" });
    y += 40;
  }

  // ---- Bundled-fees note for direct funerals
  if (isDirectFuneralType(form.funeralType)) {
    if (y > LETTERHEAD_BOTTOM_SAFE - 40) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.setFillColor(243, 245, 250);
    doc.rect(margin, y, contentWidth, 28, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(
      "Cemetery / crematorium and doctor's fees are included in the direct package price.",
      margin + 10,
      y + 17,
    );
    y += 38;
  }

  // ---- Grand total band
  if (y > LETTERHEAD_BOTTOM_SAFE - 50) {
    addPage();
    y = LETTERHEAD_TOP_SAFE;
  }
  doc.setFillColor(...NAVY);
  doc.rect(margin, y, contentWidth, 38, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("Total estimated cost", margin + 14, y + 24);
  doc.setTextColor(...GOLD);
  doc.setFontSize(14);
  doc.text(formatGBP(totals.grandTotal), pageWidth - margin - 14, y + 24, { align: "right" });
  y += 60;

  // ---- Wishes & important information
  const w = form.wishes;
  const wishPairs: Array<[string, string]> = (
    [
      ["Date of birth", w.dateOfBirth],
      ["Doctor / GP", w.doctorName],
      ["Next of kin", [w.nextOfKinName, w.nextOfKinPhone].filter(Boolean).join(" · ")],
      ["Minister / officiant", w.officiant],
      ["Hymns & music", w.music],
      ["Readings", w.readings],
      ["Flowers / donations", w.flowers],
      ["Dress code", w.dressCode],
      ["Catering / wake", w.catering],
      ["Anything else", w.other],
    ] as Array<[string, string]>
  ).filter(([, v]) => v && v.trim() !== "");

  if (wishPairs.length > 0) {
    if (y > LETTERHEAD_BOTTOM_SAFE - 60) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Wishes & important information", margin, y);
    y += 6;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentWidth, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    for (const [label, value] of wishPairs) {
      const wrapped = doc.splitTextToSize(value, contentWidth - 140);
      const blockHeight = 14 * Math.max(1, wrapped.length);
      if (y + blockHeight > LETTERHEAD_BOTTOM_SAFE) {
        addPage();
        y = LETTERHEAD_TOP_SAFE;
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...NAVY);
      doc.text(`${label}:`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(wrapped, margin + 140, y);
      y += blockHeight + 2;
    }
    y += 6;
  }

  // Funeral arranger notes are intentionally NOT rendered on the PDF — they
  // are an internal staff log, not for the customer-facing estimate. They
  // remain visible in the on-screen Summary and in the mailto body.

  // ---- Disclaimer (sits inside the letterhead's safe zone — no custom footer
  // needed because the letterhead has its own bottom band with contact details
  // and the bible verse).
  const disclaimerLines = doc.splitTextToSize(PDF_DISCLAIMER, contentWidth);
  const disclaimerHeight = disclaimerLines.length * 12 + 12;
  if (y + disclaimerHeight > LETTERHEAD_BOTTOM_SAFE) {
    addPage();
    y = LETTERHEAD_TOP_SAFE;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(disclaimerLines, margin, y);

  const safeName = (form.customer.fullName || "estimate")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  doc.save(`dcfs-estimate-${safeName}.pdf`);
}
