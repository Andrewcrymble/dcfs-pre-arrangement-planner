export type PricingCategory =
  | "funeral_type"
  | "coffin"
  | "transport"
  | "additional_service"
  | "disbursement"
  | "service_choice"
  | "discount"
  | "admin_fee";

export const DIRECT_FUNERAL_TYPES = [
  "Unattended Cremation",
  "Unattended Burial",
] as const;

export const DIRECT_PACKAGE_DISCOUNT_NAME = "Direct funeral package";

export interface PriceItem {
  category: PricingCategory;
  item_name: string;
  description: string;
  price: number;
  active: boolean;
  sort_order: number;
}

export type Branch = "Woodstock Road" | "Finaghy";
export type ArrangementFor = "Myself" | "Someone else" | "General enquiry";

export interface CustomerDetails {
  fullName: string;
  telephone: string;
  email: string;
  address: string;
  branch: Branch | "";
  arrangementFor: ArrangementFor | "";
  // Looked up live from the postcode embedded in `address` via
  // postcodes.io. Shown in the wizard ("Belfast resident") and on the
  // PDF so the arranger knows which council's resident rate applies.
  // Optional — empty when no postcode has been detected yet.
  councilDistrict?: string;
  // Plan-holder fields used when arrangementFor === "Myself" — the
  // customer IS the plan holder. DOB drives the finance term cap
  // (paying off must complete before age 80) and the underwriter
  // application needs marital status + occupation.
  dateOfBirth?: string;
  maritalStatus?: string;
  occupation?: string;
}

// Details about the person the plan is being arranged for. Only collected
// when customer.arrangementFor === "Someone else"; for "Myself", the
// customer block IS the person, and these fields stay empty. Includes
// DOB / doctor / next-of-kin which used to live on Wishes — they're more
// naturally part of "the person" than service preferences.
export interface Person {
  fullName: string;
  dateOfBirth: string;
  address: string;
  relationship: string;
  doctorName: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  // Underwriter-application fields. Optional so older saved estimates
  // without them still load cleanly.
  maritalStatus?: string;
  occupation?: string;
}

export interface Wishes {
  officiant: string;
  music: string;
  readings: string;
  flowers: string;
  dressCode: string;
  catering: string;
  other: string;
}

export interface ArrangerNote {
  id: string;
  arranger: string;
  timestamp: string; // ISO 8601
  text: string;
}

export interface CustomDisbursement {
  id: string;
  label: string;
  price: number;
}

// Arranger-applied discount. `amount` is a positive number entered in
// the wizard; buildSelectedLines flips it negative when rendering so
// the existing total / monthly / financing pipeline picks it up
// automatically. Distinct from `directPackageDiscount`, which is a
// fixed pricing-sheet item triggered by the direct-funeral toggle.
export interface CustomDiscount {
  id: string;
  label: string;
  amount: number;
}

export interface FormState {
  customer: CustomerDetails;
  person: Person;
  funeralType: string;
  serviceChoice: string;
  coffin: string;
  transport: string[];
  additionalServices: string[];
  disbursements: string[];
  customDisbursements: CustomDisbursement[];
  customDiscounts: CustomDiscount[];
  wishes: Wishes;
  directPackageDiscount: boolean;
  arrangerNotes: ArrangerNote[];
  // Cash paid up-front (deposit or any other amount taken at the time the
  // estimate is prepared). Deducted from the grand total before the
  // instalment APR calculation, and shown on the cover letter PDF.
  deposit: number;
  // Personal message written into the COVER LETTER itself, right after
  // the opening line — a warm, personal note from the arranger to the
  // client. Kept short (the letter must stay on page 1).
  coverMessage: string;
  // Free-text notes the arranger writes for the customer. Distinct from
  // `arrangerNotes` (staff-only) — these DO appear on the customer PDF.
  notesForClient: string;
  // Whether to show finance / monthly-plan content on the estimate. When
  // false, the deposit input, monthly instalment table, and the "Plan with
  // Grace" partnership boilerplate are all suppressed from the on-screen
  // summary and the PDF. Defaults to true (legacy behaviour).
  showFinanceOptions: boolean;
}

export interface SelectedLine {
  category: PricingCategory;
  item_name: string;
  description: string;
  price: number;
}
