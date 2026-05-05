import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FormState, SelectedLine } from "./types";
import { formatGBP } from "./sheets";
import {
  PDF_DISCLAIMER,
  totalsForLines,
  generateEstimateId,
  monthlyInstalmentOptions,
} from "./estimate";

// PDF uses muted black/grey palette for headings and rules (formal),
// with the brand green reserved for the prominent Total band so the
// document mirrors the on-screen estimate summary at a glance.
const NAVY: [number, number, number] = [40, 40, 40];   // charcoal — headings & table heads
const GOLD: [number, number, number] = [150, 150, 150]; // medium grey — accent rules
const SLATE: [number, number, number] = [110, 110, 110]; // muted grey — secondary text
// Brand green — Tailwind navy-700 (#45761c). Used only for the Total band
// so the headline figure pops the same way it does on screen.
const BRAND_GREEN: [number, number, number] = [69, 118, 28];

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
// The letterhead's contact-info band starts around y≈680 on the
// "139 Upper Lisburn Road…" line. Cap content at 630 so even the next
// line (subtotal labels, financed-row sub-italics) can't overlap it.
const LETTERHEAD_BOTTOM_SAFE = 630;

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

export async function generateEstimatePdf(
  form: FormState,
  lines: SelectedLine[],
  estimateId: string = generateEstimateId(),
  options: { skipDownload?: boolean; arrangerName?: string; apr?: number } = {},
): Promise<{ bytes: Uint8Array; filename: string; estimateId: string }> {
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

  // ============================================================
  // ---- Single continuous flow: opening letter directly into estimate
  // ============================================================
  // The addressed-letter header (name/address top-left, ref/date
  // top-right, "Dear …,") is reused on page 2 above the prices, so the
  // customer sees the same context whether they're holding page 1 or
  // page 2. Returns the y baseline below the salutation, ready for the
  // page-specific opening line.
  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const drawAddressedHeader = (): number => {
    let yh = LETTERHEAD_TOP_SAFE + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    if (form.customer.fullName) {
      doc.text(form.customer.fullName, margin, yh);
      yh += 14;
    }
    if (form.customer.address) {
      const addrLines = form.customer.address
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of addrLines) {
        const wrapped = doc.splitTextToSize(line, contentWidth - 220);
        doc.text(wrapped, margin, yh);
        yh += 14 * Math.max(1, wrapped.length);
      }
    }
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(`Our Reference: ${estimateId}`, pageWidth - margin, LETTERHEAD_TOP_SAFE + 10, {
      align: "right",
    });
    doc.text(dateStr, pageWidth - margin, LETTERHEAD_TOP_SAFE + 24, {
      align: "right",
    });
    yh = Math.max(yh + 18, LETTERHEAD_TOP_SAFE + 90);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(`Dear ${form.customer.fullName || "Sir / Madam"},`, margin, yh);
    return yh + 28;
  };

  // Computed up-front so the cover letter can show the headline figure
  // (and 5-year monthly equivalent) in a summary box. Re-used later in
  // the prices section without re-walking the lines array.
  const totals = totalsForLines(lines);
  const fiveYearOption = monthlyInstalmentOptions(
    totals.grandTotal,
    options.apr,
  ).find((o) => o.months === 60);

  let y = drawAddressedHeader();

  // Opening line — names the person being arranged for when applicable
  // so the customer immediately sees who the estimate is for.
  const personFor =
    form.customer.arrangementFor === "Someone else" && form.person.fullName.trim() !== ""
      ? ` for ${form.person.fullName.trim()}`
      : "";
  const openingLines = doc.splitTextToSize(
    `Please find attached funeral plan estimate as discussed${personFor}.`,
    contentWidth,
  );
  doc.text(openingLines, margin, y);
  y += openingLines.length * 16 + 6;

  // Headline price box — same brand-green band as the on-screen Total
  // tile, scaled down to fit on the cover letter alongside a 5-year
  // monthly equivalent so the customer sees the bottom line straight
  // away without flipping to the prices page.
  if (totals.grandTotal > 0 && fiveYearOption) {
    const boxHeight = 56;
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(margin, y, contentWidth, boxHeight, "F");
    doc.setTextColor(255, 255, 255);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Plan total", margin + 14, y + 22);
    doc.setFontSize(15);
    doc.text(
      formatGBP(totals.grandTotal),
      pageWidth - margin - 14,
      y + 22,
      { align: "right" },
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("5 years monthly", margin + 14, y + 44);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${formatGBP(fiveYearOption.monthly)} / month`,
      pageWidth - margin - 14,
      y + 44,
      { align: "right" },
    );

    y += boxHeight + 18;
    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  }

  // Closing courtesy line
  doc.text(
    "If we can be of any further assistance, please do not hesitate to contact us.",
    margin,
    y,
  );
  y += 32;

  // Sign-off
  doc.text("Yours sincerely,", margin, y);
  y += 56; // signature gap
  doc.setFont("helvetica", "italic");
  doc.text(options.arrangerName || "David Crymble & Sons", margin, y);
  doc.setFont("helvetica", "normal");

  // ============================================================
  // ---- Compute Person + Wishes presence now (drawn AFTER the prices,
  // mirroring the on-screen summary order: Funeral Services →
  // Third-party Costs → Wishes → Total). The cover letter sits on
  // page 1; page 2 always starts with the prices breakdown.
  // ============================================================
  const hasPersonBlock =
    form.customer.arrangementFor === "Someone else" &&
    form.person.fullName.trim() !== "";
  const _w = form.wishes;
  const hasAnyWish = [
    _w.officiant, _w.music, _w.readings, _w.flowers,
    _w.dressCode, _w.catering, _w.other,
  ].some((v) => typeof v === "string" && v.trim() !== "");

  addPage();
  // Re-stamp the addressed header at the top of the prices page so the
  // customer always knows who the estimate is for and which reference it
  // belongs to, even if pages get separated. Same name/address/reference
  // /salutation as page 1, with a "below" opening line.
  y = drawAddressedHeader();
  const page2OpeningLines = doc.splitTextToSize(
    `Please find below a funeral plan estimate as discussed${personFor}.`,
    contentWidth,
  );
  doc.text(page2OpeningLines, margin, y);
  y += page2OpeningLines.length * 16 + 14;

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

  if (funeralRows.length > 0) {
    if (y > LETTERHEAD_BOTTOM_SAFE - 80) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Professional Services", margin, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [["Category", "Item", "Estimated cost"]],
      body: funeralRows,
      theme: "grid",
      // Light fill + dark text — guaranteed to render on every viewer /
      // printer (white-on-dark fills sometimes print/preview as invisible
      // text if the fill layer is suppressed).
      headStyles: { fillColor: [235, 235, 235], textColor: [40, 40, 40], fontStyle: "bold" },
      bodyStyles: { textColor: [40, 40, 40], fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 110 },
        2: { cellWidth: 90, halign: "right" },
      },
      // top margin keeps the table below the letterhead logo on
      // continuation pages; bottom margin keeps autoTable's auto-
      // pagination above the contact-info band.
      margin: {
        left: margin,
        right: margin,
        top: LETTERHEAD_TOP_SAFE,
        bottom: pageHeight - LETTERHEAD_BOTTOM_SAFE,
      },
      // autoTable creates its own pages when the table is long; restamp
      // the letterhead on those new pages so the branding never drops.
      // The callback fires for the INITIAL page too — re-stamping there
      // would cover the addressed-letter header we just drew, so we
      // skip the first invocation by tracking the start page.
      willDrawPage: ((startPage) => () => {
        // @ts-expect-error jsPDF internal page lookup
        const current = doc.internal.getCurrentPageInfo().pageNumber;
        if (current > startPage) {
          drawLetterhead(doc, letterhead, pageWidth, pageHeight);
        }
      })(
        // @ts-expect-error jsPDF internal page lookup
        doc.internal.getCurrentPageInfo().pageNumber,
      ),
    });
    // @ts-expect-error autoTable adds lastAutoTable to the doc
    y = doc.lastAutoTable.finalY + 8;

    if (y > LETTERHEAD_BOTTOM_SAFE - 30) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.setFontSize(11);
    doc.text("Funeral services subtotal", margin, y + 12);
    doc.text(formatGBP(totals.funeralTotal), pageWidth - margin, y + 12, { align: "right" });
    y += 26;
  }

  if (disbursementRows.length > 0) {
    // Keep the disbursement section together. The closing italic note
    // and subtotal refer to the table directly above them — splitting
    // them across pages leaves a context-less line at the top of the
    // next page (e.g. "These are estimated third-party costs and may
    // change." floating alone with no table in sight).
    const disbSectionEstimate =
      16 /* heading */ +
      26 /* table header row */ +
      36 * disbursementRows.length /* multi-line body rows */ +
      40 /* italic note + bold subtotal */;
    if (y + disbSectionEstimate > LETTERHEAD_BOTTOM_SAFE) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Estimated Third-party Costs", margin, y + 4);
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
      // top margin keeps the table below the letterhead logo on
      // continuation pages; bottom margin keeps autoTable's auto-
      // pagination above the contact-info band.
      margin: {
        left: margin,
        right: margin,
        top: LETTERHEAD_TOP_SAFE,
        bottom: pageHeight - LETTERHEAD_BOTTOM_SAFE,
      },
      // Same continuation-only re-stamp pattern as the funeral table —
      // initial page already has the letterhead and any preamble text,
      // so we mustn't draw the PNG over it.
      willDrawPage: ((startPage) => () => {
        // @ts-expect-error jsPDF internal page lookup
        const current = doc.internal.getCurrentPageInfo().pageNumber;
        if (current > startPage) {
          drawLetterhead(doc, letterhead, pageWidth, pageHeight);
        }
      })(
        // @ts-expect-error jsPDF internal page lookup
        doc.internal.getCurrentPageInfo().pageNumber,
      ),
    });
    // @ts-expect-error autoTable adds lastAutoTable to the doc
    y = doc.lastAutoTable.finalY + 8;

    // Need room for the italic note + the bold subtotal line. If we're
    // too close to the bottom safe zone, push to a fresh page first.
    if (y > LETTERHEAD_BOTTOM_SAFE - 50) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }

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

    // RPI guarantee paragraph — mandatory wording that explains that the
    // disbursements figure shown is what's covered by the plan today, but
    // RPI uplift on the actual third-party costs at the time of the
    // funeral may exceed it and become payable by the family.
    const rpiParagraph =
      `Disbursements costs of ${formatGBP(totals.disbursementsTotal)} are included. ` +
      "They are guaranteed to the RPI (Retail Price Index) and may require " +
      "additional payment from the estate/next of kin at the time of the funeral.";
    const rpiLines = doc.splitTextToSize(rpiParagraph, contentWidth);
    const rpiHeight = rpiLines.length * 12 + 6;
    if (y + rpiHeight > LETTERHEAD_BOTTOM_SAFE) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text(rpiLines, margin, y);
    y += rpiHeight;
  }

  // ---- Person being arranged for (after prices, mirrors the on-screen
  // order so the document reads top-to-bottom the same way as the screen
  // summary: Funeral Services → Third-party Costs → Person → Wishes → Total)
  if (hasPersonBlock) {
    if (y > LETTERHEAD_BOTTOM_SAFE - 100) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Person being arranged for", margin, y);
    y += 6;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentWidth, y);
    y += 12;

    const personLines: [string, string][] = [
      ["Full name", form.person.fullName],
      ["Date of birth", form.person.dateOfBirth || "—"],
      ["Relationship", form.person.relationship || "—"],
      ["Address", form.person.address || "—"],
      ["Doctor / GP", form.person.doctorName || "—"],
      [
        "Next of kin",
        [form.person.nextOfKinName, form.person.nextOfKinPhone]
          .filter((s) => s && s.trim() !== "")
          .join(" · ") || "—",
      ],
    ];
    doc.setFontSize(10);
    for (const [label, value] of personLines) {
      const wrapped = doc.splitTextToSize(value, contentWidth - 110);
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
      doc.text(wrapped, margin + 110, y);
      y += blockHeight + 2;
    }
    y += 6;
  }

  // ---- Wishes & important information (after prices, before Total band)
  if (hasAnyWish) {
    const wishPairs: Array<[string, string]> = (
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

    if (wishPairs.length > 0) {
      if (y > LETTERHEAD_BOTTOM_SAFE - 80) {
        addPage();
        y = LETTERHEAD_TOP_SAFE;
      }
      y += 4;
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
      y += 8;
    }
  }

  // ---- Grand total band
  if (y > LETTERHEAD_BOTTOM_SAFE - 50) {
    addPage();
    y = LETTERHEAD_TOP_SAFE;
  }
  // Brand-green band with white text — matches the on-screen Total tile so
  // the headline figure draws the eye the same way it does in the wizard.
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(margin, y, contentWidth, 38, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("Total estimated cost", margin + 14, y + 24);
  doc.setFontSize(15);
  doc.text(formatGBP(totals.grandTotal), pageWidth - margin - 14, y + 24, { align: "right" });
  y += 60;

  // ---- Monthly instalment options (1–5 years; 24-month interest-free
  // window then 6% APR amortized on the remaining balance for longer terms)
  if (totals.grandTotal > 0) {
    if (y > LETTERHEAD_BOTTOM_SAFE - 160) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Monthly plan options", margin, y);
    y += 6;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentWidth, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text(
      "If you'd prefer to spread the cost, here is the monthly equivalent over each available term.",
      margin,
      y,
    );
    y += 18;

    const aprPct = (options.apr ?? 0.06) * 100;
    const aprLabel = `${aprPct % 1 === 0 ? aprPct.toFixed(0) : aprPct.toFixed(2)}%`;
    const instalmentOptions = monthlyInstalmentOptions(
      totals.grandTotal,
      options.apr,
    );
    for (const opt of instalmentOptions) {
      // A financed row needs ~26pt (main + italic sub); a plain row ~14pt.
      // Check before drawing so the italic finance-charge note can never
      // land in the letterhead band.
      const rowHeight = opt.isFinanced ? 26 : 14;
      if (y + rowHeight > LETTERHEAD_BOTTOM_SAFE) {
        addPage();
        y = LETTERHEAD_TOP_SAFE;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...NAVY);
      doc.text(opt.yearLabel, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(`(${opt.months} monthly instalments)`, margin + 70, y);

      doc.setFont("helvetica", "bold");
      doc.text(
        `${formatGBP(opt.monthly)} / month`,
        pageWidth - margin,
        y,
        { align: "right" },
      );
      y += 12;
      if (opt.isFinanced) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...SLATE);
        doc.text(
          `Finance charge: ${formatGBP(opt.financeCharge)} (${aprLabel} APR on balance after 24 months)`,
          margin + 14,
          y,
        );
        doc.setFontSize(10);
        y += 12;
      }
      y += 2;
    }

    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    const noteLines = doc.splitTextToSize(
      `First 24 months are interest-free. Beyond 24 months, a ${aprLabel} APR is applied to the remaining balance. ` +
        "Figures are illustrative — your final monthly amount will be confirmed at sign-up.",
      contentWidth,
    );
    doc.text(noteLines, margin, y);
    y += noteLines.length * 10 + 14;
  }

  // Wishes are now rendered up on page 2 with the Person details block.

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
  y += disclaimerLines.length * 12 + 18;

  // ---- Closing boilerplate: optional third-party costs + Plan with Grace
  // partnership statement. Office requirement — must appear on every estimate.
  if (y > LETTERHEAD_BOTTOM_SAFE - 90) {
    addPage();
    y = LETTERHEAD_TOP_SAFE;
  }

  // Note heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Note", margin, y);
  y += 6;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 14;

  const noteIntro =
    "Third-party costs (what we pay on your behalf) can go up and down depending on personal need. Here are some third-party costs not included in the quote but can be added if required.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  const noteIntroLines = doc.splitTextToSize(noteIntro, contentWidth);
  if (y + noteIntroLines.length * 12 > LETTERHEAD_BOTTOM_SAFE) {
    addPage();
    y = LETTERHEAD_TOP_SAFE;
  }
  doc.text(noteIntroLines, margin, y);
  y += noteIntroLines.length * 12 + 10;

  const optionalCosts: [string, string][] = [
    ["Flowers", "From £80 upwards"],
    ["Paper / online Funeral Notice", "From £14.40 to £100 approx."],
    ["Officiant Fee", "From £60 – £200"],
    ["Organist", "From £60 upwards"],
    ["Caretaker", "From £40 upwards"],
    ["Limousine", "From £286 upwards"],
    ["Order of Service", "£40 per 50 copies"],
  ];
  for (const [label, value] of optionalCosts) {
    if (y + 16 > LETTERHEAD_BOTTOM_SAFE) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 240, y);
    y += 14;
  }
  y += 10;

  // Why Choose section
  if (y > LETTERHEAD_BOTTOM_SAFE - 80) {
    addPage();
    y = LETTERHEAD_TOP_SAFE;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('Why Choose "Plan with Grace"?', margin, y);
  y += 6;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 16;

  const benefits: [string, string][] = [
    ["Complete Transparency", "Clear and honest details on all inclusions and exclusions."],
    ["Financial Protection", "Plan protection under the FSCS, covering values up to £85,000."],
    ["24/7 Access", "Online access to your plan anytime, day or night."],
    ["Dedicated Funeral Planner", "Personalised support to guide you through every step."],
    ["No Instalment Fees", "No fees on the first 24 monthly instalments."],
    [
      "FCA Regulated",
      "Your plan is safeguarded by the Financial Conduct Authority, ensuring the highest standards of financial security and customer protection.",
    ],
  ];
  doc.setFontSize(10);
  for (const [label, body] of benefits) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    const labelText = `• ${label}: `;
    const labelW = doc.getTextWidth(labelText);
    const bodyLines = doc.splitTextToSize(body, contentWidth - labelW);
    const blockHeight = bodyLines.length * 12 + 4;
    if (y + blockHeight > LETTERHEAD_BOTTOM_SAFE) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.text(labelText, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(bodyLines[0], margin + labelW, y);
    for (let i = 1; i < bodyLines.length; i++) {
      y += 12;
      doc.text(bodyLines[i], margin + labelW, y);
    }
    y += 14;
  }
  y += 6;

  const closingParas = [
    'By choosing "Plan with Grace," you’re assured peace of mind and the warmth of a partnership with David Crymble & Sons, a trusted family funeral directors. This collaboration combines the reliability of an FCA-regulated plan with the compassionate, personal care of a family-owned business, ensuring your wishes are honoured with clarity, security, and dedicated support.',
    "If you would like to proceed with the plan, please contact us, and we will guide you through the next steps.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  for (const para of closingParas) {
    const paraLines = doc.splitTextToSize(para, contentWidth);
    const blockHeight = paraLines.length * 12 + 10;
    if (y + blockHeight > LETTERHEAD_BOTTOM_SAFE) {
      addPage();
      y = LETTERHEAD_TOP_SAFE;
    }
    doc.text(paraLines, margin, y);
    y += blockHeight;
  }

  const safeName = (form.customer.fullName || "estimate")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  const filename = `${estimateId}-${safeName}.pdf`;
  // Mobile browsers (especially Safari) handle doc.save() inconsistently —
  // the download can silently fail or interrupt the JS flow. Callers that
  // only need the bytes (e.g. the WhatsApp pipeline that uploads to Drive)
  // pass skipDownload: true so we never invoke the local download dialog.
  if (!options.skipDownload) {
    doc.save(filename);
  }
  return {
    bytes: new Uint8Array(doc.output("arraybuffer")),
    filename,
    estimateId,
  };
}
