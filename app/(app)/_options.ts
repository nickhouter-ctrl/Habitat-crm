/** Shared helpers to populate pickers in the deal/property/document/product forms. */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, deals, products, projects, properties, users } from "@/lib/db/schema";

export type SelectOption = { id: string; name: string };

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  collection: string | null;
  unit: string | null;
  priceEur: string | null;
  tradePriceEur: string | null;
  costEur: string | null;
  vatRate: number;
  additionalSizes:
    | Array<{ sku: string; label: string; priceEur?: number | null; inStock?: boolean }>
    | null;
};

async function listContacts(): Promise<SelectOption[]> {
  return db.query.contacts.findMany({
    columns: { id: true, name: true },
    orderBy: asc(contacts.name),
    limit: 1000,
  });
}

async function listProperties(): Promise<SelectOption[]> {
  const rows = await db.query.properties.findMany({
    columns: { id: true, title: true },
    orderBy: asc(properties.title),
    limit: 1000,
  });
  return rows.map((p) => ({ id: p.id, name: p.title }));
}

async function listUsers(): Promise<SelectOption[]> {
  const rows = await db.query.users.findMany({
    columns: { id: true, name: true, email: true },
    orderBy: asc(users.name),
    limit: 200,
  });
  return rows.map((u) => ({ id: u.id, name: u.name ?? u.email }));
}

async function listDeals(): Promise<SelectOption[]> {
  const rows = await db.query.deals.findMany({
    columns: { id: true, title: true },
    orderBy: desc(deals.updatedAt),
    limit: 1000,
  });
  return rows.map((d) => ({ id: d.id, name: d.title }));
}

async function listProjects(): Promise<SelectOption[]> {
  const rows = await db.query.projects.findMany({
    columns: { id: true, name: true, status: true },
    orderBy: [asc(projects.status), desc(projects.updatedAt)],
    limit: 500,
  });
  return rows.map((p) => ({ id: p.id, name: p.status === "archived" ? `${p.name} (gearchiveerd)` : p.name }));
}

async function listActiveProducts(): Promise<ProductOption[]> {
  return db.query.products.findMany({
    // Losse deuren (leaf) niet direct verkoopbaar — alleen de SET-producten.
    // De sets (sku …-SET) en het beslag (categorie Beslag) blijven gewoon kiesbaar.
    where: and(
      eq(products.isActive, true),
      sql`not (${products.category} in ('Binnendeuren', 'Buitendeuren') and coalesce(${products.sku}, '') not like '%-SET')`,
    ),
    columns: { id: true, name: true, sku: true, category: true, collection: true, unit: true, priceEur: true, tradePriceEur: true, costEur: true, vatRate: true, additionalSizes: true },
    orderBy: [asc(products.category), asc(products.name)],
    limit: 2000,
  });
}

export async function getProductCategories(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .orderBy(asc(products.category));
  return rows
    .map((r) => r.category?.trim())
    .filter((c): c is string => Boolean(c));
}

export async function getProductCollections(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ collection: products.collection })
    .from(products)
    .orderBy(asc(products.collection));
  return rows
    .map((r) => r.collection?.trim())
    .filter((c): c is string => Boolean(c));
}

export async function getDealFormOptions() {
  const [c, p, u] = await Promise.all([listContacts(), listProperties(), listUsers()]);
  return { contacts: c, properties: p, users: u };
}

export async function getPropertyFormOptions() {
  const [c, u] = await Promise.all([listContacts(), listUsers()]);
  return { contacts: c, users: u };
}

export async function getDocumentFormOptions() {
  const [c, d, p, prods, projs] = await Promise.all([
    listContacts(),
    listDeals(),
    listProperties(),
    listActiveProducts(),
    listProjects(),
  ]);
  return { contacts: c, deals: d, properties: p, products: prods, projects: projs };
}
