/**
 * Loose typings for the Holded API. Holded's responses are sparsely documented
 * and fields vary by account/module, so these are intentionally permissive —
 * narrow them as real payloads are observed.
 *
 * Docs: https://developers.holded.com/
 */

/** Holded "invoicing" document types we care about. */
export const HOLDED_DOC_TYPES = [
  "estimate", // offerte
  "proform", // pro-forma
  "invoice", // factuur
  "creditnote",
  "salesreceipt",
  "salesorder",
  "purchase", // inkoop-/aankoopfactuur
  "waybill", // pakbon / albarán
] as const;
export type HoldedDocType = (typeof HOLDED_DOC_TYPES)[number];

/**
 * Een Holded-contact (klant, leverancier of lead). Gespiegeld in de eigen
 * `contacts`-tabel via `holded_sync_map` — dit is de ruwe API-vorm.
 */
export interface HoldedContact {
  id: string;
  customId?: string;
  name?: string;
  code?: string;
  vatnumber?: string;
  tradeName?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  type?: "client" | "supplier" | "debtor" | "creditor" | "lead" | string;
  isperson?: boolean | number;
  /** Bank details. */
  iban?: string;
  swift?: string;
  /** Billing/shipping addresses. */
  billAddress?: HoldedAddress;
  shipAddress?: HoldedAddress;
  defaults?: Record<string, unknown>;
  socialNetworks?: Record<string, string>;
  tags?: string[];
  notes?: string;
  contactPersons?: Array<{
    name?: string;
    job?: string;
    email?: string;
    phone?: string;
  }>;
  /** Unix seconds. */
  createdAt?: number;
  updatedAt?: number;
  updateHash?: string;
}

/** Een product uit Holded's catalogus. Prijzen zijn numbers, ex. btw tenzij anders vermeld. */
export interface HoldedProduct {
  id: string;
  kind?: string; // "simple" | "variants" | ...
  name: string;
  desc?: string;
  sku?: string;
  barcode?: string;
  price?: number; // sales price, ex. VAT
  taxes?: string[]; // e.g. ["s_iva_21"]
  total?: number; // incl. VAT
  hasStock?: boolean;
  stock?: number;
  cost?: number; // cost price
  purchasePrice?: number; // last purchase price
  weight?: number;
  tags?: string[];
  categoryId?: string;
  factoryCode?: string;
  forSale?: boolean;
  forPurchase?: boolean;
  updateHash?: string;
}

/** Adresblok zoals Holded het levert op contacten (facturatie- én verzendadres). */
export interface HoldedAddress {
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  country?: string;
  countryCode?: string;
}

/** Eén regel op een Holded-document (het `products`-array van {@link HoldedDocument}). */
export interface HoldedDocumentItem {
  name?: string;
  desc?: string;
  units?: number;
  price?: number;
  tax?: number; // percent
  taxes?: string[];
  discount?: number;
  sku?: string;
  productId?: string;
}

/**
 * Een Holded-document (offerte, factuur, inkoopfactuur, …; zie
 * {@link HoldedDocType}). Bedragen zijn numbers in documentvaluta; datums
 * unix-seconden.
 */
export interface HoldedDocument {
  id: string;
  contact?: string; // Holded contact id
  contactName?: string;
  desc?: string;
  date?: number; // unix seconds
  dueDate?: number; // unix seconds
  notes?: string;
  docNumber?: string;
  currency?: string;
  currencyChange?: number;
  /** Sum lines (before tax). */
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  /** 0 = unpaid, 1 = paid, 2 = partially paid (Holded conventions vary). */
  status?: number;
  /** True for concept-/draft-documenten in Holded. `status` is *payment*-status, niet approval. */
  draft?: boolean;
  paymentsTotal?: number;
  paymentsPending?: number;
  products?: HoldedDocumentItem[];
  tags?: string[];
  updateHash?: string;
}

/** Shape of an inbound Holded webhook body — best guess, kept open. */
export interface HoldedWebhookPayload {
  /** Event name, e.g. "salesinvoice.created", "contact.updated". */
  name?: string;
  /** Some Holded webhooks nest the event differently — keep raw fields too. */
  event?: string;
  /** The affected resource id, when present. */
  id?: string;
  resourceId?: string;
  /** Account / org id. */
  accountId?: string;
  data?: unknown;
  [key: string]: unknown;
}
