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
  wishes: Wishes;
  directPackageDiscount: boolean;
  arrangerNotes: ArrangerNote[];
}

export interface SelectedLine {
  category: PricingCategory;
  item_name: string;
  description: string;
  price: number;
}
