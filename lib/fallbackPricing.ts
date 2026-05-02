import type { PriceItem } from "./types";

// Used only when NEXT_PUBLIC_USE_FALLBACK_PRICING=true (e.g. for local
// development without a Google Sheet configured). The live app shows a
// friendly error if the sheet fails, so the office never quotes from these
// numbers by accident.
export const FALLBACK_PRICING: PriceItem[] = [
  // Funeral types
  { category: "funeral_type", item_name: "Attended Burial", description: "Traditional service followed by burial", price: 2750, active: true, sort_order: 1 },
  { category: "funeral_type", item_name: "Attended Cremation", description: "Traditional service followed by cremation", price: 2650, active: true, sort_order: 2 },
  { category: "funeral_type", item_name: "Unattended Cremation", description: "Direct cremation with no formal service", price: 1450, active: true, sort_order: 3 },
  { category: "funeral_type", item_name: "Unattended Burial", description: "Direct burial with no formal service", price: 1750, active: true, sort_order: 4 },
  { category: "funeral_type", item_name: "Other / unsure", description: "We'll discuss the options with you", price: 0, active: true, sort_order: 5 },

  // Discount — applied conditionally when an Unattended (direct) funeral type is chosen
  { category: "discount", item_name: "Direct funeral package", description: "Pre-paid simple package — basic coffin only, no viewing or service", price: -500, active: true, sort_order: 1 },

  // Admin fee — automatically applied to every plan
  { category: "admin_fee", item_name: "'With Grace' plan administration fee", description: "Standard administration fee applied to every pre-arranged plan", price: 375, active: true, sort_order: 1 },

  // Service choices
  { category: "service_choice", item_name: "Church service", description: "Service held at your chosen church", price: 0, active: true, sort_order: 1 },
  { category: "service_choice", item_name: "Funeral home service", description: "Service held at our chapel of rest", price: 0, active: true, sort_order: 2 },
  { category: "service_choice", item_name: "Graveside service", description: "Short committal service at the graveside", price: 0, active: true, sort_order: 3 },
  { category: "service_choice", item_name: "Crematorium service only", description: "Service held at the crematorium", price: 0, active: true, sort_order: 4 },
  { category: "service_choice", item_name: "No service", description: "No formal service", price: 0, active: true, sort_order: 5 },
  { category: "service_choice", item_name: "Unsure", description: "Decide at a later date", price: 0, active: true, sort_order: 6 },

  // Coffins
  { category: "coffin", item_name: "Standard veneered oak", description: "Classic veneered oak coffin with brass-effect fittings", price: 495, active: true, sort_order: 1 },
  { category: "coffin", item_name: "Solid oak", description: "Solid oak coffin with traditional fittings", price: 895, active: true, sort_order: 2 },
  { category: "coffin", item_name: "Solid mahogany", description: "Premium solid mahogany", price: 1095, active: true, sort_order: 3 },
  { category: "coffin", item_name: "Willow (woven)", description: "Woven willow coffin — natural finish", price: 795, active: true, sort_order: 4 },
  { category: "coffin", item_name: "Wicker / seagrass", description: "Hand-woven seagrass — eco-friendly", price: 725, active: true, sort_order: 5 },
  { category: "coffin", item_name: "Cardboard", description: "Simple cardboard coffin", price: 195, active: true, sort_order: 6 },

  // Transport
  { category: "transport", item_name: "Hearse only", description: "Single hearse to and from the service — included as standard", price: 0, active: true, sort_order: 1 },
  { category: "transport", item_name: "Hearse + 1 limousine", description: "Hearse plus one family limousine (up to 6 passengers)", price: 225, active: true, sort_order: 2 },
  { category: "transport", item_name: "Hearse + 2 limousines", description: "Hearse plus two family limousines", price: 425, active: true, sort_order: 3 },
  { category: "transport", item_name: "Additional limousine", description: "Each additional limousine", price: 200, active: true, sort_order: 4 },
  { category: "transport", item_name: "Horse-drawn hearse", description: "Pair of horses with traditional carriage", price: 995, active: true, sort_order: 5 },
  { category: "transport", item_name: "Other", description: "Bespoke transport — discuss with our team", price: 0, active: true, sort_order: 6 },

  // Additional services
  { category: "additional_service", item_name: "Embalming", description: "Hygienic preparation of the deceased — included at no extra charge", price: 0, active: true, sort_order: 1 },
  { category: "additional_service", item_name: "Order of service", description: "Printed order of service booklets (50 copies)", price: 120, active: true, sort_order: 2 },
  { category: "additional_service", item_name: "Flowers", description: "Family floral tribute", price: 150, active: true, sort_order: 3 },
  { category: "additional_service", item_name: "Newspaper notice", description: "Notice in local newspaper", price: 95, active: true, sort_order: 4 },
  { category: "additional_service", item_name: "Livestream / recording", description: "Live broadcast and recording of the service", price: 150, active: true, sort_order: 5 },
  { category: "additional_service", item_name: "Memorial consultation", description: "Headstone and memorial guidance", price: 0, active: true, sort_order: 6 },
  { category: "additional_service", item_name: "Repatriation advice", description: "Guidance on bringing a loved one home or abroad", price: 0, active: true, sort_order: 7 },
  { category: "additional_service", item_name: "Other", description: "Bespoke request — discuss with our team", price: 0, active: true, sort_order: 8 },

  // Disbursements
  { category: "disbursement", item_name: "Crematorium fee", description: "Fee paid to the crematorium", price: 985, active: true, sort_order: 1 },
  { category: "disbursement", item_name: "Burial fee", description: "Cemetery purchase / re-opening fee", price: 1250, active: true, sort_order: 2 },
  { category: "disbursement", item_name: "Doctor's fee", description: "Cremation forms (where applicable)", price: 82, active: true, sort_order: 3 },
  { category: "disbursement", item_name: "Minister / celebrant fee", description: "Officiant for the service", price: 180, active: true, sort_order: 4 },
  { category: "disbursement", item_name: "Grave opening fee", description: "Cemetery grave opening", price: 650, active: true, sort_order: 5 },
  { category: "disbursement", item_name: "Other third-party costs", description: "Other disbursements as they arise", price: 0, active: true, sort_order: 6 },
];
