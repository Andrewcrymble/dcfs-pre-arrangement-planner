import type { InscriptionDesign } from "@/components/InscriptionDesigner";

// Shape of an order as it flows between the editor, the proxy, and
// upstream Apps Script. Mirrors the keys used in mapSheetOrderToTracker
// + upsertOrder so a round-trip preserves the data.
export interface HeadstoneOrder {
  orderId: string;
  orderRef?: string;
  created?: string;
  lastUpdated?: string;
  orderDate?: string;
  status: HeadstoneStatus;
  paymentStatus: string;

  customerName: string;
  phone: string;
  email: string;
  address: string;

  deceasedName: string;
  deceasedDob: string;
  deceasedDod: string;

  hsType: string;
  hsSize: string;
  hsColour: string;
  hsColourAdj: number;
  hsFinish: string;
  hsSellPrice: number;
  hsCostPrice: number;

  surroundType: string;
  surroundGranite: boolean;
  surroundSellPrice: number;
  surroundCostPrice: number;

  stoneType: string;
  stoneSellPrice: number;
  stoneCostPrice: number;

  accessories: string[];
  accessoriesSellPrice: number;
  accessoriesCostPrice: number;

  inscriptionType: "new" | "additional";
  inscriptionText: string;
  inscriptionLines: number;
  inscriptionStyle: string;
  inscriptionColour: string;
  inscriptionSellPrice: number;
  inscriptionCostPrice: number;
  inscriptionDesign: InscriptionDesign | null;

  cemetery: string;
  cemeteryFee: number;
  graveNumber: string;

  additionalServices: string;
  servicesSellPrice: number;
  servicesCostPrice: number;

  totalSellPrice: number;
  totalCostPrice: number;
  profitMargin: number;
  marginPercentage: number;

  depositPaid: number;
  balanceDue: number;

  proofDate: string;
  artworkApproved: boolean;
  productionDate: string;
  installDate: string;

  artworkNotes: string;
  notes: string;
  masonNotes: string;

  archived: boolean;

  files?: unknown[];
  stripeLinkId?: string;
  stripePaymentUrl?: string;
  masonNotifiedAt?: string;
}

export const STATUS_PIPELINE = [
  "Enquiry",
  "Quoted",
  "Confirmed",
  "In Design",
  "Production",
  "Ready",
  "Installed",
] as const;
export type HeadstoneStatus = (typeof STATUS_PIPELINE)[number];

export function emptyOrder(orderId: string): HeadstoneOrder {
  return {
    orderId,
    orderRef: orderId.slice(-8).toUpperCase(),
    status: "Enquiry",
    paymentStatus: "Unpaid",
    customerName: "",
    phone: "",
    email: "",
    address: "",
    deceasedName: "",
    deceasedDob: "",
    deceasedDod: "",
    hsType: "",
    hsSize: "",
    hsColour: "",
    hsColourAdj: 0,
    hsFinish: "",
    hsSellPrice: 0,
    hsCostPrice: 0,
    surroundType: "",
    surroundGranite: false,
    surroundSellPrice: 0,
    surroundCostPrice: 0,
    stoneType: "",
    stoneSellPrice: 0,
    stoneCostPrice: 0,
    accessories: [],
    accessoriesSellPrice: 0,
    accessoriesCostPrice: 0,
    inscriptionType: "new",
    inscriptionText: "",
    inscriptionLines: 0,
    inscriptionStyle: "",
    inscriptionColour: "Gold",
    inscriptionSellPrice: 0,
    inscriptionCostPrice: 0,
    inscriptionDesign: null,
    cemetery: "",
    cemeteryFee: 0,
    graveNumber: "",
    additionalServices: "",
    servicesSellPrice: 0,
    servicesCostPrice: 0,
    totalSellPrice: 0,
    totalCostPrice: 0,
    profitMargin: 0,
    marginPercentage: 0,
    depositPaid: 0,
    balanceDue: 0,
    proofDate: "",
    artworkApproved: false,
    productionDate: "",
    installDate: "",
    artworkNotes: "",
    notes: "",
    masonNotes: "",
    archived: false,
  };
}

export function generateOrderId(): string {
  // Matches the rough shape the existing JS app uses: timestamp + suffix
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

export function shortRef(orderId: string): string {
  return (orderId || "").slice(-8).toUpperCase();
}

// Recompute totals + margin from individual sell/cost fields. Matches
// the formulas in upsertOrder so the saved row reflects what the
// editor showed.
export function recalcTotals(o: HeadstoneOrder): HeadstoneOrder {
  const totalSellPrice =
    (o.hsSellPrice || 0) +
    (o.hsColourAdj || 0) +
    (o.surroundSellPrice || 0) +
    (o.stoneSellPrice || 0) +
    (o.accessoriesSellPrice || 0) +
    (o.inscriptionSellPrice || 0) +
    (o.cemeteryFee || 0) +
    (o.servicesSellPrice || 0);
  const totalCostPrice =
    (o.hsCostPrice || 0) +
    (o.surroundCostPrice || 0) +
    (o.stoneCostPrice || 0) +
    (o.accessoriesCostPrice || 0) +
    (o.inscriptionCostPrice || 0) +
    (o.cemeteryFee || 0) +
    (o.servicesCostPrice || 0);
  const profitMargin = totalSellPrice - totalCostPrice;
  const marginPercentage =
    totalSellPrice > 0 ? (profitMargin / totalSellPrice) * 100 : 0;
  const balanceDue = Math.max(0, totalSellPrice - (o.depositPaid || 0));
  return {
    ...o,
    totalSellPrice,
    totalCostPrice,
    profitMargin,
    marginPercentage,
    balanceDue,
  };
}

// Inscription pricing from the priceBook constants in Apps Script.
// New: 100 letters free, £3/letter after. Additional: flat fee + £4.50/letter
// after 50.
export function inscriptionPricing(
  letters: number,
  type: "new" | "additional",
  rules: {
    NewInscription?: {
      freeLetter: number;
      costPerLetterAfter100: number;
      sellPerLetterAfter100: number;
    };
    AdditionalInscription?: {
      costPerLetterAfter50: number;
      sellPerLetterAfter50: number;
    };
  } = {},
): { sell: number; cost: number } {
  if (type === "additional") {
    const r = rules.AdditionalInscription || {
      costPerLetterAfter50: 3,
      sellPerLetterAfter50: 4.5,
    };
    // Existing app charges a flat £250 for the first 50 letters + per-letter
    // after that on the sell side; £150 flat + £3/letter on cost.
    const baseSell = 250;
    const baseCost = 150;
    const extra = Math.max(0, letters - 50);
    return {
      sell: baseSell + extra * r.sellPerLetterAfter50,
      cost: baseCost + extra * r.costPerLetterAfter50,
    };
  }
  const r = rules.NewInscription || {
    freeLetter: 100,
    costPerLetterAfter100: 2,
    sellPerLetterAfter100: 3,
  };
  const extra = Math.max(0, letters - r.freeLetter);
  return {
    sell: extra * r.sellPerLetterAfter100,
    cost: extra * r.costPerLetterAfter100,
  };
}
