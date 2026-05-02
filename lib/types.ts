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
}

export interface Wishes {
  dateOfBirth: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  doctorName: string;
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
