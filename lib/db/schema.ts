/**
 * Habitat CRM database schema (Drizzle ORM / Postgres).
 *
 * Column names are camelCase here and stored as snake_case (see `casing` in drizzle.config.ts
 * and lib/db/index.ts). Money is stored as `numeric` (string in JS) — render with `formatEUR`.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ helpers */

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* -------------------------------------------------------------------- enums */

export const userRole = pgEnum("user_role", ["admin", "agent", "viewer"]);

export const contactType = pgEnum("contact_type", [
  "lead",
  "customer",
  "owner", // property owner
  "partner",
  "reseller", // wederverkoper — verkoopt onze producten in eigen winkel (dealerprijs)
  "supplier",
  "other",
]);

export const leadStage = pgEnum("lead_stage", [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

export const language = pgEnum("language", ["en", "nl", "es", "de"]);

export const companyType = pgEnum("company_type", [
  "client",
  "supplier",
  "partner",
  "lead",
  "other",
]);

export const dealType = pgEnum("deal_type", [
  "renovation",
  "new_build",
  "material_supply",
  "property_sale",
  "design",
  "legal",
  "other",
]);

export const dealStage = pgEnum("deal_stage", [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "on_hold",
]);

export const propertyStatus = pgEnum("property_status", [
  "available",
  "reserved",
  "under_offer",
  "sold",
  "withdrawn",
]);

export const propertyType = pgEnum("property_type", [
  "villa",
  "apartment",
  "townhouse",
  "plot",
  "renovation_project",
  "commercial",
  "other",
]);

export const documentKind = pgEnum("document_kind", [
  "estimate", // offerte
  "proforma",
  "invoice", // factuur
  "creditnote",
  "salesreceipt",
  "deliverynote", // pakbon / albarán
]);

export const documentStatus = pgEnum("document_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "paid",
  "partially_paid",
  "overdue",
  "void",
]);

export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft", // concept
  "ordered", // besteld / aanbetaling gedaan
  "in_transit", // onderweg (geproduceerd / verscheept)
  "received", // ontvangen — voorraad bijgewerkt
  "cancelled",
]);

export const activityType = pgEnum("activity_type", [
  "note",
  "call",
  "email",
  "meeting",
  "task",
]);

export const syncEntity = pgEnum("sync_entity", ["contact", "company", "document"]);
export const syncDirection = pgEnum("sync_direction", ["pull", "push"]);

/* -------- klantportal: accounts, aanvragen, referral/commissie -------- */
/** Prijsniveau van een klant-account: particulier (normale prijs) of aannemer (−20%). */
export const customerPriceTier = pgEnum("customer_price_tier", ["particulier", "aannemer"]);
/** Status van een klant-account. */
export const customerAccountStatus = pgEnum("customer_account_status", ["pending", "active", "suspended"]);
/** Soort accountaanvraag van de website. */
export const accountRequestKind = pgEnum("account_request_kind", ["particulier", "zakelijk"]);
/** Status van een accountaanvraag. */
export const accountRequestStatus = pgEnum("account_request_status", ["pending", "approved", "rejected"]);
/** Aanbreng-relatie: zakelijk (bedrijf brengt bedrijf) of particulier (aannemer brengt particulier). */
export const referralScope = pgEnum("referral_scope", ["business", "particulier"]);
/** Status van een commissieregel. */
export const commissionStatus = pgEnum("commission_status", ["pending", "approved", "paid"]);

/** Betaalwijze van arbeid/kosten op een project: contant of per factuur. */
export const paymentMethod = pgEnum("payment_method", ["cash", "invoice"]);
/** Soort project: verkoop (productgedreven) of bouw (werkzaamheden). */
export const projectKind = pgEnum("project_kind", ["sales", "construction"]);
/** Categorie van een losse projectkostenregel. */
export const projectCostCategory = pgEnum("project_cost_category", [
  "material", // materialen van derden (tegels, lijm, ...)
  "subcontractor", // onderaannemer
  "equipment", // huur materieel/gereedschap
  "other",
]);
/** Status van een uitgegeven sample: uit (borg uitstaand) / retour / verkocht. */
export const sampleMovementStatus = pgEnum("sample_movement_status", ["out", "returned", "sold"]);
/** Manier waarop een ontvangen klantbetaling binnenkwam. */
export const receivedPaymentMethod = pgEnum("received_payment_method", [
  "cash", // contant
  "bank", // bankoverschrijving
  "invoice", // via (derden)factuur
  "advance", // voorschot / aanbetaling
  "other",
]);
/** Categorie van een begrotingsregel (incl. arbeid t.o.v. de losse-kosten-categorie). */
export const budgetCategory = pgEnum("budget_category", [
  "labor", // arbeid (geraamde uren × tarief)
  "material", // materialen
  "subcontractor", // onderaannemer
  "equipment", // materieel/gereedschap
  "other",
]);

/* ---------------------------------------------------------- auth.js tables */
/* Standard @auth/drizzle-adapter schema, extended with passwordHash + role.   */

export const users = pgTable("users", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text(),
  email: text().notNull().unique(),
  emailVerified: timestamp({ mode: "date", withTimezone: true }),
  image: text(),
  passwordHash: text(),
  role: userRole().notNull().default("agent"),
  ...timestamps,
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().$type<AdapterAccountType>().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp({ mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ----------------------------------------------------------------- companies */

export const companies = pgTable(
  "companies",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text().notNull(),
    type: companyType().notNull().default("client"),
    vatNumber: text(), // NIF / CIF
    email: text(),
    phone: text(),
    website: text(),
    addressLine: text(),
    city: text(),
    postalCode: text(),
    province: text(),
    country: text().default("ES"),
    ownerId: uuid().references(() => users.id, { onDelete: "set null" }),
    notes: text(),
    ...timestamps,
  },
  (t) => [index("companies_name_idx").on(t.name)],
);

/* ------------------------------------------------------------------ contacts */

export const contacts = pgTable(
  "contacts",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    firstName: text(),
    lastName: text(),
    /** Display name — kept denormalised so company-only contacts still sort/search. */
    name: text().notNull(),
    email: text(),
    phone: text(),
    mobile: text(),
    jobTitle: text(),
    type: contactType().notNull().default("lead"),
    /** Pipeline stage — only meaningful while `type` is `lead`. */
    stage: leadStage().notNull().default("new"),
    source: text(), // website, referral, holded, walk-in, ...
    preferredLanguage: language().default("es"),
    ownerId: uuid().references(() => users.id, { onDelete: "set null" }),
    addressLine: text(),
    city: text(),
    postalCode: text(),
    province: text(),
    country: text().default("ES"),
    tags: text().array(),
    notes: text(),
    lastContactedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("contacts_name_idx").on(t.name),
    index("contacts_email_idx").on(t.email),
    index("contacts_owner_idx").on(t.ownerId),
    index("contacts_company_idx").on(t.companyId),
  ],
);

/* --------------------------------------------------------------- properties */

export const properties = pgTable(
  "properties",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    reference: text().unique(), // internal listing ref
    title: text().notNull(),
    slug: text().unique(),
    status: propertyStatus().notNull().default("available"),
    type: propertyType().notNull().default("villa"),
    priceEur: numeric({ precision: 14, scale: 2 }),
    bedrooms: integer(),
    bathrooms: integer(),
    plotSqm: integer(),
    builtSqm: integer(),
    location: text(), // free text, e.g. "Xàbia — Montgó"
    description: text(),
    /** The owner of the property (a contact in our CRM), if known. */
    ownerContactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    /** Listing agent / responsible. */
    ownerId: uuid().references(() => users.id, { onDelete: "set null" }),
    images: jsonb().$type<string[]>(),
    isPublished: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("properties_status_idx").on(t.status),
    index("properties_type_idx").on(t.type),
  ],
);

/* --------------------------------------------------------------- products */

/**
 * Leverbaarheid van een product:
 *  - "stock"      = telt mee in voorraad/voorraadwaarde (default).
 *  - "order_only" = leveren we alleen op bestelling; telt NOOIT mee in
 *                   voorraadtellingen/-waarde/low-stock/rapporten, maar mag wel
 *                   in de complete prijslijst en op een bestelbon.
 */
export const productAvailability = pgEnum("product_availability", ["stock", "order_only"]);

/**
 * Product / material catalogue. For now maintained in the CRM; once the Holded
 * API key is supplied this becomes a mirror of Holded's products (linked via
 * `holdedProductId`). `category` groups items (e.g. "Magic Stone", with each
 * variant a row under it).
 */
export const products = pgTable(
  "products",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text().notNull(),
    sku: text(),
    /** EAN-13 / GTIN barcode (auto-generated, or entered manually). */
    barcode: text(),
    /** Current stock on hand (mirror of Holded once synced). */
    stockQty: numeric({ precision: 14, scale: 3 }),
    /** Sample-voorraad (zelfde SKU) — fysieke staaltjes die we kunnen uitgeven. */
    sampleStockQty: numeric({ precision: 10, scale: 2 }),
    /** Lage-voorraad-drempel — alert verschijnt wanneer stockQty onder dit getal zakt. */
    stockMin: numeric({ precision: 14, scale: 3 }),
    /** Top-level group / department, e.g. "Wandpanelen", "Badkamer", "Accessoires". */
    collection: text(),
    category: text(), // e.g. "Italian Travertine", "Magic Stone" — the product family
    subcategory: text(),
    unit: text(), // "m²", "stuk", "m", "uur", ...
    priceEur: numeric({ precision: 14, scale: 4 }), // showroom-prijs voor particulieren, ex. VAT
    /** Aannemers-/architectenprijs (B2B), ex. VAT. Doorgaans ~20% lager dan
     * priceEur, maar per product instelbaar. Wordt gebruikt wanneer een offerte/
     * factuur wordt aangemaakt met klanttype = aannemer. */
    tradePriceEur: numeric({ precision: 14, scale: 4 }),
    /** Wederverkoper-/dealerprijs (B2B winkels), ex. VAT. Leeg → afgeleid als
     * particulierprijs −25%. Per product te overschrijven. */
    dealerPriceEur: numeric({ precision: 14, scale: 4 }),
    vatRate: integer().notNull().default(21), // default IVA % for this product
    // Landed-cost breakdown (per unit) — China imports etc.:
    purchaseCostEur: numeric({ precision: 14, scale: 2 }), // inkoopprijs (bv. uit China)
    freightCostEur: numeric({ precision: 14, scale: 2 }), // vracht China → EU (Valencia)
    transportCostEur: numeric({ precision: 14, scale: 2 }), // transport Valencia → Xàbia
    otherCostEur: numeric({ precision: 14, scale: 2 }), // overige kosten
    dutyPct: numeric({ precision: 6, scale: 2 }), // invoerrechten % op (inkoop + vracht)
    targetMarginPct: numeric({ precision: 6, scale: 2 }), // gewenste marge % → adviesverkoopprijs
    /** Cached landed cost = sum of the breakdown (incl. duty). Manually entered too if no breakdown. */
    costEur: numeric({ precision: 14, scale: 2 }),
    currency: text().notNull().default("EUR"),
    description: text(),
    /**
     * Vertaalde omschrijvingen per locale (NL/DE/EN/ES). `description` blijft
     * de primaire/originele tekst; gevulde locales overrulen op de website.
     */
    descriptionI18n: jsonb().$type<{ nl?: string; de?: string; en?: string; es?: string }>(),
    // Afmetingen — gesynct naar de habitat-one website (matched op SKU).
    widthMm: numeric({ precision: 10, scale: 2 }),
    heightMm: numeric({ precision: 10, scale: 2 }),
    lengthMm: numeric({ precision: 10, scale: 2 }),
    thicknessMm: numeric({ precision: 10, scale: 2 }),
    /**
     * Alternatieve maten met eigen SKU per maat. Bv. wandpanelen die in
     * meerdere formaten leverbaar zijn:
     *   [{ sku: "MS-167", label: "2400 × 590 mm" },
     *    { sku: "MS-168", label: "1200 × 190 mm" }]
     */
    additionalSizes: jsonb().$type<
      Array<{
        sku: string;
        label: string;
        /** Verkoopprijs (particulier, ex. BTW) voor deze maat. */
        priceEur?: number | null;
        /** Inkoopprijs (raw, leverancier) voor deze maat. */
        purchaseEur?: number | null;
        /** Kostprijs (landed: inkoop + vracht/invoer/kosten) voor deze maat. */
        costEur?: number | null;
        /** Voorraad-aantal van deze maat. */
        stockQty?: number | null;
        /** Afgeleid: stockQty > 0 (voor snelle weergave/filter). */
        inStock?: boolean;
      }>
    >(),
    /**
     * Bundle-componenten voor set/kit-producten. Per regel een component-SKU
     * en hoeveel-stuks-per-set. Stock van de set = min(component.stockQty / qty).
     * Bij verkoop wordt elk component met qty afgetrokken.
     *   [{ sku: "DR-002", qty: 1 },
     *    { sku: "DR-001", qty: 4 },   // 4 hinges per deur
     *    { sku: "DR-009", qty: 1 }]
     */
    components: jsonb().$type<Array<{ sku: string; qty: number }>>(),
    imageUrl: text(),
    isActive: boolean().notNull().default(true),
    /** Voorraad-product (default) of alleen-op-bestelling — order_only telt nooit mee in voorraad. */
    availability: productAvailability().notNull().default("stock"),
    /** Aan = mag op de website. De sync-actie creëert dan een entry op habitat-one (matched op SKU); bestaande entries worden altijd bijgewerkt, los van deze vlag. */
    pushToWebsite: boolean().notNull().default(false),
    /** Habitat-one product-id, ingevuld door de sync zodra een match (of nieuwe entry) is gemaakt. */
    websiteProductId: integer(),
    holdedProductId: text(),
    ...timestamps,
  },
  (t) => [
    index("products_collection_idx").on(t.collection),
    index("products_category_idx").on(t.category),
    index("products_name_idx").on(t.name),
    uniqueIndex("products_holded_id_idx").on(t.holdedProductId),
  ],
);

/* ------------------------------------------------ consignatie bij wederverkopers */

/**
 * Consignatievoorraad bij een wederverkoper (dealer/winkel die onze producten
 * verkoopt). Eén regel per (wederverkoper × product). "Neerleggen" haalt het van
 * onze eigen voorraad (`products.stockQty`) af en zet het hier als geplaatst;
 * bij verkoop door de dealer stijgt `qtySold` (→ onze omzet tegen dealerprijs).
 * Nu-in-winkel = qtyPlaced − qtySold. Bedragen ex. btw.
 */
export const consignments = pgTable(
  "consignments",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** De wederverkoper (contact met type "reseller"). */
    resellerId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    /** Naam/SKU/eenheid-snapshot (voor als het product later wijzigt/verdwijnt). */
    productName: text().notNull(),
    sku: text(),
    unit: text(),
    /** Dealerprijs-snapshot bij plaatsing (ex. btw). */
    dealerPriceEur: numeric({ precision: 14, scale: 4 }),
    /** Kostprijs-snapshot (landed) — voor de dealermarge. */
    costEur: numeric({ precision: 14, scale: 2 }),
    /** Totaal aantal dat naar deze dealer is gegaan. */
    qtyPlaced: numeric({ precision: 14, scale: 3 }).notNull().default("0"),
    /** Aantal dat de dealer heeft verkocht (→ onze omzet). */
    qtySold: numeric({ precision: 14, scale: 3 }).notNull().default("0"),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    index("consignments_reseller_idx").on(t.resellerId),
    index("consignments_product_idx").on(t.productId),
    uniqueIndex("consignments_reseller_product_idx").on(t.resellerId, t.productId),
  ],
);

/* ------------------------------------------------------ samples (staaltjes) */

/**
 * Sample-logboek: elke uitgifte van een staaltje (zelfde SKU als het product).
 * "Uitgeven" verlaagt `products.sampleStockQty` en zet een regel op `out` met €5
 * borg. Bij retour (`returned`) komt de borg + voorraad terug; bij verkoop
 * (`sold`) blijft de sample weg en is de borg definitief (omzet). "Waar zijn de
 * samples" = regels met status `out`, per ontvanger.
 */
export const sampleMovements = pgTable(
  "sample_movements",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    productName: text().notNull(),
    sku: text(),
    unit: text(),
    /** Ontvanger (klant/wederverkoper) — optioneel als alleen een naam bekend is. */
    recipientId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    recipientName: text(),
    qty: numeric({ precision: 10, scale: 2 }).notNull().default("1"),
    /** Borg per sample (ex. btw). */
    depositEur: numeric({ precision: 10, scale: 2 }).notNull().default("5"),
    status: sampleMovementStatus().notNull().default("out"),
    date: date().notNull(),
    /** Optioneel gekoppeld document (offerte/factuur) waarop de sample staat. */
    documentId: uuid(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index("sample_movements_product_idx").on(t.productId),
    index("sample_movements_recipient_idx").on(t.recipientId),
    index("sample_movements_status_idx").on(t.status),
  ],
);

/* -------------------------------------------------------------------- deals */

export const deals = pgTable(
  "deals",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text().notNull(),
    type: dealType().notNull().default("renovation"),
    stage: dealStage().notNull().default("lead"),
    valueEur: numeric({ precision: 14, scale: 2 }),
    probability: integer().notNull().default(10), // 0–100
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    propertyId: uuid().references(() => properties.id, { onDelete: "set null" }),
    ownerId: uuid().references(() => users.id, { onDelete: "set null" }),
    expectedCloseDate: date(),
    closedAt: timestamp({ withTimezone: true }),
    description: text(),
    ...timestamps,
  },
  (t) => [
    index("deals_stage_idx").on(t.stage),
    index("deals_owner_idx").on(t.ownerId),
    index("deals_contact_idx").on(t.contactId),
  ],
);

/* --------------------------------------------------- documents (quotes/invoices) */

export type DocumentLineItem = {
  name: string;
  description?: string;
  units: number;
  price: number; // unit price, EUR, ex. VAT (before discount)
  /** Line discount, percent (0–100). */
  discount?: number;
  taxRate?: number; // IVA percent, e.g. 21 / 10 / 4
  /** Line category — drives the default VAT (materiaal, arbeid, renovatie, ...). */
  category?: string;
  /** Optional link to a catalogue product (snapshot of name/price stays on the line). */
  productId?: string;
  /** Kostprijs per stuk (ex. btw) — bv. voor kozijnen op maat waar geen product
   * met kostprijs aan hangt. Gebruikt voor de marge-weergave. */
  costEur?: number;
  /** Kozijn-calculator (import): leveranciersprijs + marge% waaruit costEur/price
   * zijn berekend (leverancier × 1,55 = kostprijs; × (1+marge%) = verkoop). */
  supplierPriceEur?: number;
  marginPct?: number;
  /** Fase-sleutel: koppelt deze regel aan een fase van de offerte (bv. "1"),
   * zodat we per fase kunnen factureren. Kan vooraf of achteraf toegekend worden. */
  phase?: string;
  /** Verrekenregel: verwijst naar de aanbetaling/voorschot-factuur (documents.id)
   * die met deze (negatieve) regel wordt weggestreept. Zo weten we welke
   * aanbetaling verrekend is. */
  advanceRef?: string;
};

/** Geordende fase-definitie op een offerte/factuur (voor naam/volgorde/planning). */
export type DocumentPhase = {
  /** Stabiele sleutel die op de regels (`DocumentLineItem.phase`) verwijst. */
  key: string;
  label: string;
  /** Geplande factuurdatum (optioneel) — "YYYY-MM-DD". */
  plannedDate?: string;
  note?: string;
};

export const documents = pgTable(
  "documents",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: documentKind().notNull().default("estimate"),
    docNumber: text(), // e.g. "EST-2026-0001" / Holded's number
    status: documentStatus().notNull().default("draft"),
    title: text(),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    dealId: uuid().references(() => deals.id, { onDelete: "set null" }),
    propertyId: uuid().references(() => properties.id, { onDelete: "set null" }),
    projectId: uuid().references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    issueDate: date(),
    dueDate: date(),
    currency: text().notNull().default("EUR"),
    subtotalEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    taxEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    totalEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    paidEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    items: jsonb().$type<DocumentLineItem[]>().notNull().default(sql`'[]'::jsonb`),
    /** Offerte: geordende fase-definities (naam/volgorde/planning). Regels verwijzen
     * via `DocumentLineItem.phase` naar `key`. Leeg = niet in fases opgedeeld. */
    phases: jsonb().$type<DocumentPhase[]>(),
    /** Factuur: welke offerte-fase deze (deel)factuur dekt — zodat de offerte per
     * fase 'gefactureerd' kan tonen. Null = niet fase-gebaseerd (bv. percentage). */
    coveredPhase: text(),
    notes: text(),
    /** Bijlagen (bv. kozijn-tekeningen van de leverancier) — meegestuurd in de
     * offerte-mail naar de klant. Opgeslagen in de private storage-bucket. */
    attachments: jsonb().$type<
      Array<{ name: string; path: string; size: number; contentType: string; uploadedAt: string }>
    >(),
    /** Sent to the client (status moved to "sent"). */
    sentAt: timestamp({ withTimezone: true }),
    /** Random token for the public accept/reject page (/offerte/[token]). */
    acceptToken: text(),
    acceptedAt: timestamp({ withTimezone: true }),
    rejectedAt: timestamp({ withTimezone: true }),
    rejectReason: text(),
    /** Voor pakbonnen: op dit moment is de voorraad afgeboekt (één keer). */
    stockAppliedAt: timestamp({ withTimezone: true }),
    /** Offerte: producten alvast gereserveerd (vóór acceptatie) — telt mee als
     * gereserveerde voorraad zodat je ziet wat besteld moet worden. */
    reservedAt: timestamp({ withTimezone: true }),
    /** Bron-offerte: op een factuur (of deelfactuur) verwijst dit naar de offerte
     * waaruit hij is gemaakt. Zo weet een offerte welke factu(u)r(en) eraan hangen
     * en kunnen we "Gefactureerd" tonen — ook bij deelfacturen. Geen harde FK
     * (soft link) zodat verwijderen niet cascadeert. */
    sourceDocumentId: uuid(),
    /** Aanbetaling/voorschot: deze factuur is een aanbetaling op een project die
     * later op de eindfactuur verrekend wordt. */
    isAdvance: boolean().notNull().default(false),
    /** BTW verlegd (inversión del sujeto pasivo): factuur zonder BTW (0%) + de
     * wettelijke vermelding op de PDF. */
    vatReverseCharge: boolean().notNull().default(false),
    /** Aanbetaling: moment waarop deze is verrekend op een eindfactuur (null = nog
     * openstaand/te verrekenen). */
    advanceSettledAt: timestamp({ withTimezone: true }),
    /** Pakbon: moment van afleveren. Een pakbon kent alleen klaargezet → afgeleverd
     * (geen factuurstatussen). */
    deliveredAt: timestamp({ withTimezone: true }),
    /** Factuur: moment waarop de laatste betaalherinnering is verstuurd (zodat we
     * niet dagelijks blijven mailen). */
    paymentReminderAt: timestamp({ withTimezone: true }),
    /** Factuur: hoeveel herinneringen al verstuurd (0=geen, 1=1e, 2=2e, 3=aanmaning). */
    reminderLevel: integer().notNull().default(0),
    /** Factuur/levering: review-verzoek verstuurd op (zodat we maar één keer vragen). */
    reviewRequestedAt: timestamp({ withTimezone: true }),
    /** Convenience copy of the Holded id; the source of truth mapping lives in holded_sync_map. */
    holdedId: text(),
    ...timestamps,
  },
  (t) => [
    index("documents_kind_idx").on(t.kind),
    index("documents_status_idx").on(t.status),
    index("documents_contact_idx").on(t.contactId),
    uniqueIndex("documents_holded_id_idx").on(t.holdedId),
    uniqueIndex("documents_accept_token_idx").on(t.acceptToken),
  ],
);

/* ------------------------------------------------------------- projecten */
/* Projecten zoals in Holded — een container voor werkzaamheden/uren/kosten   */
/* over één klus heen. (Onze `deals` zijn salesgericht; projecten zijn meer  */
/* uitvoeringsgericht en kunnen aan documenten/inkoop gekoppeld worden.)    */

export const projects = pgTable(
  "projects",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text().notNull(),
    description: text(),
    /** Soort project: "sales" (productgedreven, default) of "construction" (bouw/werkzaamheden). */
    kind: projectKind().notNull().default("sales"),
    /** Afgesproken aanneemprijs (ex. BTW), optioneel. Indien gezet is dit het
     * omzetdoel; anders valt het doel terug op het offertetotaal. */
    contractPriceEur: numeric({ precision: 14, scale: 2 }),
    /** Begrote uren (optioneel) — om uren-voortgang tegen af te zetten. */
    budgetHours: numeric({ precision: 8, scale: 2 }),
    /** Onvoorzien-percentage op de begroting (bv. 8) — als aparte regel meegerekend. */
    contingencyPct: numeric({ precision: 5, scale: 2 }),
    /** Werf/adres-alias(sen) voor automatische factuurherkenning (komma-gescheiden,
     * bv. "Cap Negre, Cap Negre nº53"). Zo herkent de AI een bouwfactuur met de
     * werf-naam als dit project. */
    siteAlias: text(),
    /** Korte code/sleutel uit Holded (bv. "VER"). */
    code: text(),
    color: text(),
    /** "active" | "archived" — eenvoudig vrij veld voor nu. */
    status: text().notNull().default("active"),
    /** Eigenaar (verantwoordelijke medewerker). */
    ownerId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Belangrijkste klant van het project (optioneel). */
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    /** Eventueel gekoppeld aan een pand. */
    propertyId: uuid().references(() => properties.id, { onDelete: "set null" }),
    startDate: date(),
    endDate: date(),
    holdedProjectId: text(),
    ...timestamps,
  },
  (t) => [
    index("projects_status_idx").on(t.status),
    index("projects_owner_idx").on(t.ownerId),
    uniqueIndex("projects_holded_id_idx").on(t.holdedProjectId),
  ],
);

/* ------------------------------------------------ purchase orders (inkoop) */

export type PurchaseOrderLineItem = {
  name: string;
  sku?: string;
  /** Link to the catalogue product this line replenishes. */
  productId?: string;
  units: number;
  /** Unit price in the order's `currency` (often USD for the China suppliers). */
  unitPrice: number;
  note?: string;
};

/** An uploaded source document (proforma invoice / PI PDF) stored in Supabase. */
export type PurchaseOrderAttachment = {
  name: string;
  /** Storage object path (private bucket — fetch a signed URL on demand). */
  path: string;
  size?: number;
  uploadedAt?: string;
};

/**
 * Incoming supplier orders ("binnenkomende bestellingen") — e.g. the China
 * proforma invoices from KingKonree / Magic Stone. When a PO is marked
 * `received`, each line's `units` is added to its product's `stockQty`.
 */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    supplier: text().notNull(),
    /** Optioneel gekoppeld project — telt dan mee als materiaal/inkoopkost op de klus. */
    projectId: uuid().references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    /** Gekoppeld als arbeid/uren (bv. een bouwer-factuur): telt dan als arbeidskost
     * (via een uren-regel) i.p.v. materiaal, om dubbeltelling te voorkomen. */
    countAsLabor: boolean().notNull().default(false),
    /** AI-suggestie bij binnenkomst: voorgesteld project om aan te koppelen. */
    suggestedProjectId: uuid().references((): AnyPgColumn => projects.id, { onDelete: "set null" }),
    /** AI-suggestie: 'labor' (uren) of 'material'. */
    suggestedKind: text(),
    /** AI-suggestie: aantal uren (bij arbeid). */
    suggestedHours: numeric({ precision: 8, scale: 2 }),
    /** Supplier's order / proforma-invoice number. */
    reference: text(),
    status: purchaseOrderStatus().notNull().default("ordered"),
    currency: text().notNull().default("EUR"),
    orderDate: date(),
    expectedDate: date(),
    receivedAt: timestamp({ withTimezone: true }),
    /** Vervaldatum van de inkoopfactuur — wanneer die betaald moet zijn. */
    dueDate: date(),
    /** Gezet zodra de inkoopfactuur volledig betaald is (null = openstaand). */
    paidAt: timestamp({ withTimezone: true }),
    /** Reeds betaald bedrag — voor deelbetalingen / Holded-sync. */
    paidEur: numeric({ precision: 14, scale: 2 }),
    /** Sum of the line totals (incl. BTW), in `currency`. */
    total: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    /** Subtotal (ex. BTW). Door Holded geleverd; voor handmatige PO's gelijk aan total. */
    subtotal: numeric({ precision: 14, scale: 2 }),
    /** BTW-bedrag, in `currency`. */
    tax: numeric({ precision: 14, scale: 2 }),
    items: jsonb().$type<PurchaseOrderLineItem[]>().notNull().default(sql`'[]'::jsonb`),
    attachments: jsonb().$type<PurchaseOrderAttachment[]>().notNull().default(sql`'[]'::jsonb`),
    notes: text(),
    /** Set once stock has been added, so we never double-count. */
    stockAppliedAt: timestamp({ withTimezone: true }),
    /** When this PO mirrors a Holded purchase document, its id (for idempotent sync). */
    holdedId: text(),
    /** Container nummer (bv. YMMU1441857) — voor auto-link van facturen. */
    containerRef: text(),
    /** Shipment / booking referentie (bv. ZMI2600251) — voor auto-link. */
    shipmentRef: text(),
    /**
     * Cached landed-cost-berekening (laatst toegepast).
     * Format: { factoryTotal, overheadTotal, ratio, appliedAt, breakdown: [{ category, amount }] }
     */
    landedCostSummary: jsonb().$type<{
      factoryTotalEur: number;
      overheadTotalEur: number;
      ratio: number;
      appliedAt: string;
      breakdown: Array<{ category: string; amount: number; attachmentCount: number }>;
    }>(),
    ...timestamps,
  },
  (t) => [
    index("purchase_orders_status_idx").on(t.status),
    index("purchase_orders_supplier_idx").on(t.supplier),
    uniqueIndex("purchase_orders_holded_id_idx").on(t.holdedId),
    index("purchase_orders_container_ref_idx").on(t.containerRef),
    index("purchase_orders_shipment_ref_idx").on(t.shipmentRef),
    index("purchase_orders_project_idx").on(t.projectId),
  ],
);

/* ----------------------------------------- ploeg, uren & projectkosten (job-costing) */

/**
 * De ploeg ("de jongens") — arbeiders met een kostentarief per uur. Los van de
 * CRM-loginaccounts (`users`); dit zijn de uitvoerders op de klus.
 */
export const workers = pgTable(
  "workers",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    name: text().notNull(),
    /** Functie/rol (bv. tegelzetter, schilder). Vrij veld. */
    role: text(),
    /** Kostentarief per uur (ex. BTW) — wat de arbeider ons kost. */
    hourlyCostEur: numeric({ precision: 8, scale: 2 }),
    /** Standaard betaalwijze (contant/factuur) — per urenregel te overschrijven. */
    defaultPaymentMethod: paymentMethod().notNull().default("cash"),
    /** Taal van het urenportaal voor deze arbeider: "nl" | "es" | "en". */
    portalLang: text().notNull().default("es"),
    active: boolean().notNull().default(true),
    notes: text(),
    ...timestamps,
  },
  (t) => [index("workers_active_idx").on(t.active)],
);

/**
 * Urenportaal-links: één persoonlijke link per arbeider PER PROJECT
 * (/uren/[token]). De ploeg wordt zo aan een project "verwezen" — de link laat
 * alleen op dát project uren schrijven. Werkt iemand op twee projecten, dan
 * krijgt hij twee links. Verwijderen = intrekken.
 */
export const workerPortalLinks = pgTable(
  "worker_portal_links",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    workerId: uuid()
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
    token: text().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("worker_portal_links_token_idx").on(t.token),
    uniqueIndex("worker_portal_links_worker_project_idx").on(t.workerId, t.projectId),
    index("worker_portal_links_project_idx").on(t.projectId),
  ],
);

/**
 * Urenregistratie per project. Arbeidskost van een regel = `hours × hourlyCostEur`
 * (tarief-snapshot, los van latere tariefwijzigingen). `paymentMethod` is
 * informatief + afrekenstatus (`paidAt`); het telt nooit dubbel — arbeid wordt
 * uitsluitend via deze tabel als kost geteld.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workerId: uuid().references(() => workers.id, { onDelete: "set null" }),
    /** Naam-snapshot (voor als de worker later verwijderd/gewijzigd wordt). */
    workerName: text(),
    date: date().notNull(),
    hours: numeric({ precision: 6, scale: 2 }).notNull(),
    /** Tarief-snapshot op het moment van invoeren. */
    hourlyCostEur: numeric({ precision: 8, scale: 2 }).notNull().default("0"),
    paymentMethod: paymentMethod().notNull().default("cash"),
    /** Gezet zodra afgerekend (contant betaald / factuur voldaan). */
    paidAt: timestamp({ withTimezone: true }),
    /** Bron-inkooporder: als deze uren-regel automatisch is gemaakt door een
     * bouwer-inkooporder als arbeid te koppelen. Zo zijn PO en uren echt verbonden. */
    purchaseOrderId: uuid().references((): AnyPgColumn => purchaseOrders.id, { onDelete: "cascade" }),
    /** Gezet als de arbeider dit zelf via het urenportaal (/uren/[token]) heeft
     * ingevoerd — zodat je in het overzicht ziet wat van de jongens zelf komt. */
    selfLoggedAt: timestamp({ withTimezone: true }),
    /** Portaal-uren tellen pas mee in de kosten na controle door kantoor
     * (goedkeuren op de projectpagina). Regels van kantoor zelf (selfLoggedAt
     * null) zijn impliciet goedgekeurd. */
    approvedAt: timestamp({ withTimezone: true }),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index("time_entries_project_idx").on(t.projectId),
    index("time_entries_worker_idx").on(t.workerId),
    index("time_entries_date_idx").on(t.date),
  ],
);

/**
 * Losse projectkosten die niet via een gekoppelde inkooporder lopen — bv.
 * contant gekochte tegels/lijm of een onderaannemer. Bedragen ex. BTW.
 */
export const projectCosts = pgTable(
  "project_costs",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: date().notNull(),
    category: projectCostCategory().notNull().default("material"),
    description: text().notNull(),
    supplier: text(),
    /** Bedrag ex. BTW. */
    amountEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    paymentMethod: paymentMethod().notNull().default("invoice"),
    paidAt: timestamp({ withTimezone: true }),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index("project_costs_project_idx").on(t.projectId),
    index("project_costs_date_idx").on(t.date),
  ],
);

/**
 * Ontvangen betalingen van de klant op een project — los van de formele
 * facturatie (`documents`). Bedoeld om aanbetalingen/voorschotten en contante
 * ontvangsten vast te leggen die (nog) niet 1-op-1 op een Habitat-factuur staan.
 * Telt NIET mee in de omzet/marge (die blijft factuurgebaseerd); puur als
 * inzicht in wat de klant al heeft betaald. Bedragen incl. eventuele btw.
 */
export const projectPayments = pgTable(
  "project_payments",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Datum van ontvangst (optioneel — niet altijd bekend). */
    date: date(),
    /** Ontvangen bedrag (incl. btw). */
    amountEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    method: receivedPaymentMethod().notNull().default("bank"),
    /** Omschrijving zoals de klant/boekhouding 'm noemt (bv. "factuur F26009 creadores"). */
    description: text(),
    note: text(),
    ...timestamps,
  },
  (t) => [index("project_payments_project_idx").on(t.projectId)],
);

/**
 * Begroting per project: geraamde kosten (en optioneel prijs) per regel, vóór de
 * uitvoering. Som van de regels = begrote kosten; afgezet tegen de werkelijke
 * kosten (uren + inkoop + materiaal) en de aanneemprijs/offerte op het dashboard.
 * Bedragen ex. BTW.
 */
export const projectBudgetLines = pgTable(
  "project_budget_lines",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: budgetCategory().notNull().default("material"),
    /** Sectie/hoofdgroep (vrij), bv. "Woning" of "Buiten / zwembad / tuin". */
    section: text(),
    /** Fase waarin dit onderdeel valt (label-string, bv. "Fase 1"). Sluit aan op
     * de fase-facturatie (DocumentLineItem.phase). */
    phase: text(),
    /** Onderdeel/omschrijving, bv. "Sloop / strippen". */
    description: text().notNull(),
    /** Aantal (bv. geraamde uren of stuks) — optioneel. */
    quantity: numeric({ precision: 12, scale: 2 }),
    /** Prijs per eenheid (ex. BTW) — optioneel. */
    unitPriceEur: numeric({ precision: 14, scale: 2 }),
    /** Targetprijs / begroot bedrag (ex. BTW) — de verkoop-/aanneemkant. */
    amountEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    /** Geraamde kostprijs (ex. BTW) — interne kost → begrote marge = amount − cost. */
    estimatedCostEur: numeric({ precision: 14, scale: 2 }),
    /** Stelpost (richtwaarde, nog niet definitief). */
    isStelpost: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    note: text(),
    ...timestamps,
  },
  (t) => [index("project_budget_lines_project_idx").on(t.projectId)],
);

/**
 * Fases van een (bouw)project: naam + omschrijving van wat er in die fase gebeurt,
 * plus volgorde en indicatieve duur. Begrotingsregels en offerteregels verwijzen
 * via de fase-naam; bij "offerte van begroting" worden deze fases meegegeven.
 */
export const projectPhases = pgTable(
  "project_phases",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Omschrijving van de werkzaamheden in deze fase. */
    description: text(),
    /** Indicatieve duur/planning, vrij veld (bv. "Week 1–3 · 2 weken"). */
    plannedWeeks: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("project_phases_project_idx").on(t.projectId)],
);

/* ----------------------------------------------- quote requests (van website) */

/**
 * Aanvragen die binnenkomen via "Vraag offerte aan" op habitat-one.
 * Status: pending → accepted | rejected. Bij accept maken we (optioneel)
 * een contact + offerte aan en wordt de klant gemaild.
 */
export const quoteRequests = pgTable(
  "quote_requests",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    company: text(),
    message: text(),
    /** Producten waar klant interesse in heeft, vrij overgenomen van de site. */
    productSkus: jsonb().$type<string[]>(),
    productNames: jsonb().$type<string[]>(),
    productSlugs: jsonb().$type<string[]>(),
    locale: text(), // nl/de/en/es waar request vandaan kwam
    source: text().notNull().default("website"),
    /** Soort aanvraag: quote (offerte) | appointment (showroombezoek) | contact. */
    kind: text().notNull().default("quote"),
    /** Door de klant gekozen voorkeursmoment (afspraak) — "YYYY-MM-DD" / "HH:MM". */
    appointmentDate: text(),
    appointmentTime: text(),
    /** Voorgestelde alternatieve tijdslots (afspraak) waaruit de klant kiest. */
    proposedSlots: jsonb().$type<{ date: string; time: string }[]>(),
    /** Token voor de publieke "kies een tijd"-pagina (/book/[token]). */
    bookingToken: text(),
    status: text().notNull().default("pending"), // pending|proposed|accepted|rejected
    /** Gekoppeld contact (gemaakt bij accepteren als nog niet bekend). */
    contactId: uuid().references((): AnyPgColumn => contacts.id, { onDelete: "set null" }),
    /** Gekoppeld offerte-document (optioneel). */
    documentId: uuid().references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    notes: text(), // interne notitie
    acceptedAt: timestamp({ withTimezone: true }),
    rejectedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("quote_requests_status_idx").on(t.status),
    index("quote_requests_email_idx").on(t.email),
    index("quote_requests_created_idx").on(t.createdAt),
  ],
);

/* ------------------------------------------- klantportal (accounts + prijzen) */

/**
 * Accountaanvraag vanaf de website habitat-one.com. De klant vult zijn gegevens
 * in; zakelijk vereist bedrijfsnaam + IVA/BTW. Habitat keurt goed (→ contact +
 * customer_account). Team wordt gemaild; review op /accounts.
 */
export const accountRequests = pgTable(
  "account_requests",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    kind: accountRequestKind().notNull().default("particulier"),
    businessName: text(),
    vatNumber: text(),
    address: text(),
    locale: language(),
    message: text(),
    status: accountRequestStatus().notNull().default("pending"),
    /** Gezet zodra goedgekeurd en aan een contact/account gekoppeld. */
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("account_requests_status_idx").on(t.status),
    index("account_requests_email_idx").on(t.email),
  ],
);

/**
 * Klant-/aannemer-account waarmee op de website prijzen zichtbaar zijn. Los van
 * de staff-`users`-tabel. `priceTier` bepaalt welke prijs de portal-API teruggeeft
 * (particulier → priceEur, aannemer → tradePriceEur).
 */
export const customerAccounts = pgTable(
  "customer_accounts",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    contactId: uuid().references(() => contacts.id, { onDelete: "set null" }),
    email: text().notNull(),
    passwordHash: text(),
    priceTier: customerPriceTier().notNull().default("particulier"),
    status: customerAccountStatus().notNull().default("pending"),
    businessName: text(),
    vatNumber: text(),
    /** Eenmalige token voor het instellen van het wachtwoord (activatie/reset). */
    activationToken: text(),
    activationExpires: timestamp({ withTimezone: true }),
    verifiedAt: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customer_accounts_email_idx").on(t.email),
    index("customer_accounts_contact_idx").on(t.contactId),
    index("customer_accounts_status_idx").on(t.status),
  ],
);

/**
 * Aanbreng-relatie: `referrer` bracht `referee` binnen en verdient commissie op
 * diens orders. `commissionPct` = % van het orderbedrag (ex btw), instelbaar.
 * Bij scope `particulier` komt de commissie uit de particulier↔aannemer-gap en kan
 * `customerDiscountPct` als korting naar de klant gaan (rest = commissie).
 */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    referrerContactId: uuid()
      .notNull()
      .references((): AnyPgColumn => contacts.id, { onDelete: "cascade" }),
    refereeContactId: uuid()
      .notNull()
      .references((): AnyPgColumn => contacts.id, { onDelete: "cascade" }),
    scope: referralScope().notNull().default("business"),
    commissionPct: numeric({ precision: 5, scale: 2 }).notNull().default("5"),
    /** Alleen scope=particulier: korting die de aannemer aan de klant geeft. */
    customerDiscountPct: numeric({ precision: 5, scale: 2 }).notNull().default("0"),
    active: boolean().notNull().default(true),
    note: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("referrals_pair_idx").on(t.referrerContactId, t.refereeContactId),
    index("referrals_referrer_idx").on(t.referrerContactId),
    index("referrals_referee_idx").on(t.refereeContactId),
  ],
);

/**
 * Verdiende commissie per factuur van een aangebrachte klant. Aangemaakt zodra
 * een factuur voor de `referee` wordt aangemaakt. Bedragen ex. btw.
 */
export const commissionEntries = pgTable(
  "commission_entries",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    referralId: uuid()
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    documentId: uuid().references((): AnyPgColumn => documents.id, { onDelete: "set null" }),
    baseAmountEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    pct: numeric({ precision: 5, scale: 2 }).notNull().default("0"),
    amountEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    status: commissionStatus().notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    index("commission_entries_referral_idx").on(t.referralId),
    uniqueIndex("commission_entries_document_idx").on(t.documentId),
  ],
);

/**
 * Afspraken / agenda — bv. een showroombezoek dat uit een aanvraag (kind=
 * appointment) wordt ingepland. Verschijnt op /agenda.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    title: text().notNull(),
    contactId: uuid().references((): AnyPgColumn => contacts.id, { onDelete: "set null" }),
    quoteRequestId: uuid().references((): AnyPgColumn => quoteRequests.id, { onDelete: "set null" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }),
    location: text(),
    notes: text(),
    /** scheduled | completed | cancelled */
    status: text().notNull().default("scheduled"),
    createdBy: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("appointments_starts_idx").on(t.startsAt),
    index("appointments_contact_idx").on(t.contactId),
  ],
);
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;

export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type NewQuoteRequest = typeof quoteRequests.$inferInsert;

/* ----------------------------------------------------------------- activities */

export const activities = pgTable(
  "activities",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    type: activityType().notNull().default("note"),
    subject: text(),
    body: text(),
    /** For tasks: when it's due / whether it's done. */
    dueAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    contactId: uuid().references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid().references(() => companies.id, { onDelete: "cascade" }),
    dealId: uuid().references(() => deals.id, { onDelete: "cascade" }),
    propertyId: uuid().references(() => properties.id, { onDelete: "cascade" }),
    documentId: uuid().references(() => documents.id, { onDelete: "cascade" }),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("activities_contact_idx").on(t.contactId),
    index("activities_deal_idx").on(t.dealId),
    index("activities_due_idx").on(t.dueAt),
  ],
);

/* ------------------------------------------------------- Holded sync mapping */

export const holdedSyncMap = pgTable(
  "holded_sync_map",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    entityType: syncEntity().notNull(),
    localId: uuid().notNull(),
    holdedId: text().notNull(),
    lastSyncedAt: timestamp({ withTimezone: true }),
    lastSyncDirection: syncDirection(),
    /** Holded's `updateHash` / updatedAt — lets us skip no-op syncs. */
    holdedUpdatedAt: timestamp({ withTimezone: true }),
    payloadHash: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("holded_sync_local_idx").on(t.entityType, t.localId),
    uniqueIndex("holded_sync_holded_idx").on(t.entityType, t.holdedId),
  ],
);

/* ------------------------------------------------- inbound webhook event log */

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    source: text().notNull().default("holded"),
    eventType: text(), // e.g. "salesinvoice.created"
    payload: jsonb(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
  },
  (t) => [index("webhook_events_received_idx").on(t.receivedAt)],
);

/**
 * Geplande leveringen. Een levering hoort bij een (verkoop)document — meestal een
 * factuur — en houdt de planning bij: wanneer gaat het de deur uit, is de klant
 * geïnformeerd, en is het geleverd. Soft links (geen harde FK) zodat verwijderen
 * niet cascadeert.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    documentId: uuid(),
    /** Gekoppelde pakbon (deliverynote) — klaargezet bij het inplannen. */
    deliveryNoteId: uuid(),
    contactId: uuid(),
    projectId: uuid(),
    plannedDate: date(),
    /** leveren (wij bezorgen) | ophalen (klant haalt op) | plaatsen (wij monteren) */
    method: text().notNull().default("leveren"),
    /** gepland | onderweg | geleverd */
    status: text().notNull().default("gepland"),
    notes: text(),
    /** Moment waarop de klant per e-mail is geïnformeerd over de levering. */
    notifiedAt: timestamp({ withTimezone: true }),
    /** Moment waarop de "morgen wordt geleverd"-herinnering is verstuurd. */
    reminderSentAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("deliveries_document_idx").on(t.documentId),
    index("deliveries_status_idx").on(t.status),
    index("deliveries_planned_idx").on(t.plannedDate),
  ],
);

/* --------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ many }) => ({
  ownedContacts: many(contacts),
  ownedDeals: many(deals),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, { fields: [companies.ownerId], references: [users.id] }),
  contacts: many(contacts),
  deals: many(deals),
  documents: many(documents),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  owner: one(users, { fields: [contacts.ownerId], references: [users.id] }),
  deals: many(deals),
  documents: many(documents),
  activities: many(activities),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  ownerContact: one(contacts, {
    fields: [properties.ownerContactId],
    references: [contacts.id],
  }),
  owner: one(users, { fields: [properties.ownerId], references: [users.id] }),
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  contact: one(contacts, { fields: [deals.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [deals.companyId], references: [companies.id] }),
  property: one(properties, { fields: [deals.propertyId], references: [properties.id] }),
  owner: one(users, { fields: [deals.ownerId], references: [users.id] }),
  documents: many(documents),
  activities: many(activities),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  contact: one(contacts, { fields: [documents.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [documents.companyId], references: [companies.id] }),
  deal: one(deals, { fields: [documents.dealId], references: [deals.id] }),
  property: one(properties, { fields: [documents.propertyId], references: [properties.id] }),
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  activities: many(activities),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  contact: one(contacts, { fields: [projects.contactId], references: [contacts.id] }),
  property: one(properties, { fields: [projects.propertyId], references: [properties.id] }),
  documents: many(documents),
  timeEntries: many(timeEntries),
  costs: many(projectCosts),
  budgetLines: many(projectBudgetLines),
  phases: many(projectPhases),
  purchaseOrders: many(purchaseOrders),
}));

export const projectBudgetLinesRelations = relations(projectBudgetLines, ({ one }) => ({
  project: one(projects, { fields: [projectBudgetLines.projectId], references: [projects.id] }),
}));

export const projectPhasesRelations = relations(projectPhases, ({ one }) => ({
  project: one(projects, { fields: [projectPhases.projectId], references: [projects.id] }),
}));

export const workersRelations = relations(workers, ({ many }) => ({
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  worker: one(workers, { fields: [timeEntries.workerId], references: [workers.id] }),
}));

export const projectCostsRelations = relations(projectCosts, ({ one }) => ({
  project: one(projects, { fields: [projectCosts.projectId], references: [projects.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
  project: one(projects, { fields: [purchaseOrders.projectId], references: [projects.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  company: one(companies, { fields: [activities.companyId], references: [companies.id] }),
  deal: one(deals, { fields: [activities.dealId], references: [deals.id] }),
  property: one(properties, { fields: [activities.propertyId], references: [properties.id] }),
  document: one(documents, { fields: [activities.documentId], references: [documents.id] }),
  author: one(users, { fields: [activities.authorId], references: [users.id] }),
}));

/* ----------------------------------------------------------------- exports */

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type ProjectCost = typeof projectCosts.$inferSelect;
export type NewProjectCost = typeof projectCosts.$inferInsert;
export type ProjectBudgetLine = typeof projectBudgetLines.$inferSelect;
export type NewProjectBudgetLine = typeof projectBudgetLines.$inferInsert;
export type ProjectPhase = typeof projectPhases.$inferSelect;
export type NewProjectPhase = typeof projectPhases.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type HoldedSyncMap = typeof holdedSyncMap.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

/**
 * Inkomende mails vanuit Gmail. Wordt gevuld door cron-job (IMAP polling) en
 * kan manueel gelinkt worden aan een PO (leverancier-bevestiging) of offerte-
 * aanvraag (klant-vraag). Statussen: new → linked → archived.
 */
export const emailInbox = pgTable(
  "email_inbox",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    messageId: text().notNull(),
    imapUid: integer(),
    threadId: text(),
    fromEmail: text(),
    fromName: text(),
    toEmail: text(),
    ccEmail: text(),
    subject: text(),
    bodyText: text(),
    bodyHtml: text(),
    receivedAt: timestamp({ withTimezone: true }),
    attachments: jsonb().$type<Array<{
      filename: string;
      size: number;
      contentType: string;
      storagePath?: string;
    }>>(),
    status: text().notNull().default("new"),
    linkedPurchaseOrderId: uuid().references(() => purchaseOrders.id, { onDelete: "set null" }),
    linkedQuoteRequestId: uuid().references(() => quoteRequests.id, { onDelete: "set null" }),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("email_inbox_message_id_idx").on(t.messageId),
    index("email_inbox_status_idx").on(t.status),
    index("email_inbox_received_at_idx").on(t.receivedAt),
  ],
);

/** Singleton voor IMAP poll-state. */
export const emailSyncState = pgTable("email_sync_state", {
  id: text().primaryKey().default("singleton"),
  lastImapUid: integer().notNull().default(0),
  lastPolledAt: timestamp({ withTimezone: true }),
  errorMessage: text(),
  ...timestamps,
});

/**
 * Archief van UITGAANDE mails die het CRM zelf verstuurt (herinneringen,
 * aanmaningen, review-verzoeken, …) — zodat je later kunt terugzien wát er naar
 * de klant is gestuurd. Soft links (geen harde FK).
 */
export const sentEmails = pgTable(
  "sent_emails",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** reminder | review | document | other */
    kind: text().notNull().default("reminder"),
    toEmail: text(),
    subject: text(),
    html: text(),
    body: text(),
    contactId: uuid(),
    documentId: uuid(),
    ...timestamps,
  },
  (t) => [
    index("sent_emails_contact_idx").on(t.contactId),
    index("sent_emails_created_idx").on(t.createdAt),
  ],
);

export type SentEmail = typeof sentEmails.$inferSelect;

export type EmailInbox = typeof emailInbox.$inferSelect;
export type NewEmailInbox = typeof emailInbox.$inferInsert;
export type EmailSyncState = typeof emailSyncState.$inferSelect;

/**
 * Doorzoekbaar archief van mail-bijlages — facturen, vrachtbrieven, DUA's, etc.
 * Elke bijlage uit email_inbox krijgt een eigen rij hier, met categorisatie en
 * link naar Supabase Storage.
 */
export const mailAttachments = pgTable(
  "mail_attachments",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    emailId: uuid()
      .notNull()
      .references(() => emailInbox.id, { onDelete: "cascade" }),
    filename: text().notNull(),
    contentType: text(),
    sizeBytes: integer(),
    /** Pad in Supabase Storage bucket `email-attachments` */
    storagePath: text().notNull(),
    publicUrl: text(),
    /**
     * Categorie — auto-detected op basis van afzender + naam + onderwerp.
     * Kan handmatig overschreven worden in UI.
     *  - supplier-invoice (Allpack/Yohome/KKR-factuur)
     *  - freight-invoice (Alianza/Galadtrans transport)
     *  - customs-dua (Spaanse DUA / Certificado de Importación)
     *  - commission (Teresa / España Trading)
     *  - bank-statement (Banco Sabadell etc.)
     *  - quote-proforma (PI / offertes)
     *  - certificate (CE, CITES, etc.)
     *  - other
     */
    category: text().notNull().default("other"),
    /** Gedetecteerde supplier/afzender naam (Allpack, Yohome, Alianza, Teresa, etc.). */
    supplierTag: text(),
    /** Datum van mail die de bijlage bevatte. */
    receivedAt: timestamp({ withTimezone: true }),
    /** Optioneel: extracted bedrag uit factuur (voor latere AI-OCR). */
    amountEur: numeric({ precision: 14, scale: 2 }),
    /** Vrije notitie. */
    notes: text(),
    ...timestamps,
  },
  (t) => [
    index("mail_attachments_email_idx").on(t.emailId),
    index("mail_attachments_category_idx").on(t.category),
    index("mail_attachments_supplier_idx").on(t.supplierTag),
    index("mail_attachments_received_idx").on(t.receivedAt),
  ],
);

export type MailAttachment = typeof mailAttachments.$inferSelect;
export type NewMailAttachment = typeof mailAttachments.$inferInsert;

/* ============================================================================
 * Samplecatalogus (Magic Stone e.a.) — referentiecatalogus, GEEN voorraad.
 * Hiërarchie: collectie (serie) → product (item) → variant (kleur = sample) → maat.
 * Deze tabellen staan volledig los van `products` en tellen NOOIT mee in
 * voorraadtellingen of -waarde. Een variant kan optioneel naar een bestaand
 * product wijzen (existing_product_id) zodra we het al voeren.
 * ========================================================================== */

export const catalogVariantStatus = pgEnum("catalog_variant_status", [
  "sample_only", // alleen als sample binnen, (nog) niet leverbaar
  "available", // leverbaar op bestelling
  "discontinued",
]);

export const supplierOrderStatus = pgEnum("supplier_order_status", ["draft", "sent"]);

export const supplierOrderUnit = pgEnum("supplier_order_unit", ["stuk", "doos", "m2"]);

/** De series uit de leverancier-prijslijst, bv. "3D Big Panel Series". */
export const catalogCollections = pgTable(
  "catalog_collections",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nameEn: text().notNull(),
    nameCn: text(),
    /** Bovenliggende groep voor de samplecatalogus-filter, bv. "Flexibel Stone" of "Vloeren". */
    category: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("catalog_collections_sort_idx").on(t.sortOrder)],
);

/** Het item/type binnen een serie (品类), bv. "Travertine". */
export const catalogProducts = pgTable(
  "catalog_products",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    collectionId: uuid()
      .notNull()
      .references(() => catalogCollections.id, { onDelete: "cascade" }),
    nameEn: text().notNull(),
    nameCn: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("catalog_products_collection_idx").on(t.collectionId)],
);

/** Een kleur = één fysiek sample. Drager van de (door ons gegenereerde) SKU. */
export const catalogVariants = pgTable(
  "catalog_variants",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    productId: uuid()
      .notNull()
      .references(() => catalogProducts.id, { onDelete: "cascade" }),
    /** Door ons gegenereerde, unieke SKU (op het label). Bij een gematcht
     *  bestaand product = de bestaande SKU; anders een nieuwe MS-#### code. */
    sku: text().notNull(),
    /** Bestaande SKU als we het product al voeren (= sku van het gekoppelde product). */
    legacySku: text(),
    /** FK naar de gewone productentabel; gevuld zodra we dit al voeren. */
    existingProductId: uuid().references(() => products.id, { onDelete: "set null" }),
    colorNameEn: text().notNull(),
    colorNameCn: text(),
    imageUrl: text(),
    /** Hebben we dit fysiek als sample in huis? */
    hasSample: boolean().notNull().default(false),
    /** Voeren/verkopen we dit al (true zodra gematcht aan een bestaand product)? */
    inRange: boolean().notNull().default(false),
    /** Fallback-verkoopprijs; bij voorkeur op maatniveau (catalog_variant_sizes). */
    salePrice: numeric({ precision: 14, scale: 2 }),
    supplierPrice: numeric({ precision: 14, scale: 2 }),
    currency: text().notNull().default("EUR"),
    status: catalogVariantStatus().notNull().default("sample_only"),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("catalog_variants_sku_idx").on(t.sku),
    index("catalog_variants_product_idx").on(t.productId),
    index("catalog_variants_existing_product_idx").on(t.existingProductId),
    index("catalog_variants_has_sample_idx").on(t.hasSample),
    index("catalog_variants_in_range_idx").on(t.inRange),
  ],
);

/** Beschikbare maten per variant — de prijs hoort hier (verschilt per maat). */
export const catalogVariantSizes = pgTable(
  "catalog_variant_sizes",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    variantId: uuid()
      .notNull()
      .references(() => catalogVariants.id, { onDelete: "cascade" }),
    productSize: text().notNull(), // bv. "1200x600", "2400x1200"
    thicknessMm: text(), // bv. "2.5~3.5"
    sqmPerBox: numeric({ precision: 14, scale: 3 }),
    pcsPerBox: integer(),
    kgPerBox: text(), // range, bv. "18~22"
    salePrice: numeric({ precision: 14, scale: 2 }),
    supplierPrice: numeric({ precision: 14, scale: 2 }),
    /** Hebben we deze specifieke maat fysiek op voorraad? */
    inStock: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("catalog_variant_sizes_variant_idx").on(t.variantId)],
);

export type CatalogCollection = typeof catalogCollections.$inferSelect;
export type CatalogProduct = typeof catalogProducts.$inferSelect;
export type CatalogVariant = typeof catalogVariants.$inferSelect;
export type CatalogVariantSize = typeof catalogVariantSizes.$inferSelect;

/* ----------------------------------------------- bestelbonnen naar leveranciers */

/**
 * Eén bestelbon per leverancier. Een winkelmandje met meerdere leveranciers
 * wordt bij genereren opgesplitst in één `supplier_orders`-record per leverancier.
 * Staat los van `purchaseOrders` (dat is het voorraad/betaal-systeem); een
 * verzonden bestelbon kan later handmatig naar een inkooporder gepromoot worden.
 */
export const supplierOrders = pgTable(
  "supplier_orders",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** FK naar companies (type=supplier) indien bekend; anders alleen de naam. */
    supplierId: uuid().references(() => companies.id, { onDelete: "set null" }),
    /** Snapshot van de leveranciernaam (producten kunnen een vrije-tekst leverancier hebben). */
    supplierName: text().notNull(),
    supplierEmail: text(),
    /** Naam/ordernr. van de klant waarvoor besteld wordt (optioneel). */
    customerRef: text(),
    status: supplierOrderStatus().notNull().default("draft"),
    sentAt: timestamp({ withTimezone: true }),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    index("supplier_orders_supplier_idx").on(t.supplierId),
    index("supplier_orders_status_idx").on(t.status),
  ],
);

/**
 * Regels van een bestelbon. Een regel wijst naar een catalogusvariant OF een
 * gewoon product (precies één van beide). SKU/omschrijving zijn een snapshot,
 * zodat de order reproduceerbaar blijft als prijzen/SKU's later wijzigen.
 */
export const supplierOrderItems = pgTable(
  "supplier_order_items",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orderId: uuid()
      .notNull()
      .references(() => supplierOrders.id, { onDelete: "cascade" }),
    catalogVariantId: uuid().references(() => catalogVariants.id, { onDelete: "set null" }),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    size: text(),
    qty: numeric({ precision: 14, scale: 3 }).notNull(),
    unit: supplierOrderUnit().notNull().default("stuk"),
    skuSnapshot: text().notNull(),
    description: text().notNull(),
    ...timestamps,
  },
  (t) => [
    index("supplier_order_items_order_idx").on(t.orderId),
    check(
      "supplier_order_items_one_target",
      sql`num_nonnulls(${t.catalogVariantId}, ${t.productId}) = 1`,
    ),
  ],
);

export type SupplierOrder = typeof supplierOrders.$inferSelect;
export type SupplierOrderItem = typeof supplierOrderItems.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Leads generator — B2B prospecting + e-mailcampagnes.
// Prospects zijn koude, nog niet-gekwalificeerde bedrijven (gevonden via Google
// Places of geïmporteerd). Contacten blijven schoon; een prospect wordt pas een
// contact bij conversie. Alle verzendingen respecteren de suppressielijst en
// dragen een per-prospect afmeldtoken (AVG/LSSI).
// ─────────────────────────────────────────────────────────────────────────────

export const prospectCategory = pgEnum("prospect_category", [
  "architect",
  "aannemer",
  "makelaar",
  "interieur",
  "projectontwikkelaar",
  "hovenier",
  "overig",
]);

export const prospectStatus = pgEnum("prospect_status", [
  "new", // gevonden, nog niet benaderd
  "emailed", // campagne verstuurd
  "replied", // heeft gereageerd
  "bounced", // e-mail kwam niet aan
  "unsubscribed", // afgemeld
  "converted", // omgezet naar contact/klant
  "skipped", // handmatig overgeslagen
]);

export const prospectSource = pgEnum("prospect_source", ["google-places", "import", "manual"]);

export const prospects = pgTable(
  "prospects",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyName: text().notNull(),
    category: prospectCategory().notNull().default("overig"),
    email: text(),
    website: text(),
    phone: text(),
    addressLine: text(),
    city: text(),
    province: text(),
    country: text().default("ES"),
    source: prospectSource().notNull().default("manual"),
    sourceRef: text(), // google place_id of import-batch
    status: prospectStatus().notNull().default("new"),
    lawfulBasisNote: text(), // rechtsgrond/herkomst (AVG-verantwoording)
    unsubscribeToken: text().notNull().unique(),
    contactId: uuid().references((): AnyPgColumn => contacts.id, { onDelete: "set null" }),
    lastEmailedAt: timestamp({ withTimezone: true }),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("prospects_email_uidx").on(t.email),
    uniqueIndex("prospects_source_ref_uidx").on(t.sourceRef),
    index("prospects_status_idx").on(t.status),
    index("prospects_category_idx").on(t.category),
  ],
);

export const campaignStatus = pgEnum("campaign_status", ["draft", "sending", "sent"]);

export const emailCampaigns = pgTable(
  "email_campaigns",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text().notNull(),
    subject: text().notNull(),
    introText: text(),
    /** Verzendtaal van de mail: es (standaard) | nl | de | en. */
    language: text().notNull().default("es"),
    /** Productgroepen (collection-namen) die in de mail als tegels getoond worden. */
    groups: jsonb().$type<string[]>().notNull().default([]),
    /** Legacy: losse product-id's (niet meer gebruikt; groepen zijn de norm). */
    productIds: jsonb().$type<string[]>().notNull().default([]),
    audience: jsonb()
      .$type<{ categories: string[]; includeCustomers?: boolean }>()
      .notNull()
      .default({ categories: [] }),
    status: campaignStatus().notNull().default("draft"),
    sentCount: integer().notNull().default(0),
    testSentAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    createdById: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("email_campaigns_status_idx").on(t.status)],
);

export const campaignSendStatus = pgEnum("campaign_send_status", [
  "sent",
  "failed",
  "suppressed",
]);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    campaignId: uuid()
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    prospectId: uuid().references(() => prospects.id, { onDelete: "set null" }),
    email: text().notNull(),
    status: campaignSendStatus().notNull().default("sent"),
    error: text(),
    messageId: text(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_recipients_campaign_idx").on(t.campaignId),
    uniqueIndex("campaign_recipients_campaign_email_uidx").on(t.campaignId, t.email),
  ],
);

export const suppressionReason = pgEnum("suppression_reason", [
  "unsubscribed",
  "bounced",
  "complaint",
  "manual",
]);

export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text().notNull().unique(),
    reason: suppressionReason().notNull().default("unsubscribed"),
    note: text(),
    ...timestamps,
  },
);

export const prospectsRelations = relations(prospects, ({ one, many }) => ({
  contact: one(contacts, { fields: [prospects.contactId], references: [contacts.id] }),
  sends: many(campaignRecipients),
}));

export const emailCampaignsRelations = relations(emailCampaigns, ({ many }) => ({
  recipients: many(campaignRecipients),
}));

export const campaignRecipientsRelations = relations(campaignRecipients, ({ one }) => ({
  campaign: one(emailCampaigns, {
    fields: [campaignRecipients.campaignId],
    references: [emailCampaigns.id],
  }),
  prospect: one(prospects, {
    fields: [campaignRecipients.prospectId],
    references: [prospects.id],
  }),
}));

export type Prospect = typeof prospects.$inferSelect;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
