/**
 * Habitat CRM database schema (Drizzle ORM / Postgres).
 *
 * Column names are camelCase here and stored as snake_case (see `casing` in drizzle.config.ts
 * and lib/db/index.ts). Money is stored as `numeric` (string in JS) — render with `formatEUR`.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
    category: text(), // e.g. "Magic Stone", "Tegels — wand", "Diensten — montage"
    subcategory: text(),
    unit: text(), // "m²", "stuk", "m", "uur", ...
    priceEur: numeric({ precision: 14, scale: 2 }), // default sales price, ex. VAT
    vatRate: integer().notNull().default(21), // default IVA % for this product
    costEur: numeric({ precision: 14, scale: 2 }), // purchase / landed cost
    currency: text().notNull().default("EUR"),
    description: text(),
    imageUrl: text(),
    isActive: boolean().notNull().default(true),
    holdedProductId: text(),
    ...timestamps,
  },
  (t) => [
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
  price: number; // unit price, EUR, ex. VAT
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
    issueDate: date(),
    dueDate: date(),
    currency: text().notNull().default("EUR"),
    subtotalEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    taxEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    totalEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    paidEur: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    items: jsonb().$type<DocumentLineItem[]>().notNull().default(sql`'[]'::jsonb`),
    notes: text(),
    /** Convenience copy of the Holded id; the source of truth mapping lives in holded_sync_map. */
    holdedId: text(),
    ...timestamps,
  },
  (t) => [
    index("documents_kind_idx").on(t.kind),
    index("documents_status_idx").on(t.status),
    index("documents_contact_idx").on(t.contactId),
    uniqueIndex("documents_holded_id_idx").on(t.holdedId),
  ],
);

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
  activities: many(activities),
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
export type Activity = typeof activities.$inferSelect;
export type HoldedSyncMap = typeof holdedSyncMap.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
