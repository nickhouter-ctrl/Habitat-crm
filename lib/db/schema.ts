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
    notes: text(),
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
  ],
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
    status: text().notNull().default("pending"), // pending|accepted|rejected
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
    contactId: uuid(),
    projectId: uuid(),
    plannedDate: date(),
    /** leveren (wij bezorgen) | ophalen (klant haalt op) */
    method: text().notNull().default("leveren"),
    /** gepland | onderweg | geleverd */
    status: text().notNull().default("gepland"),
    notes: text(),
    /** Moment waarop de klant per e-mail is geïnformeerd over de levering. */
    notifiedAt: timestamp({ withTimezone: true }),
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
