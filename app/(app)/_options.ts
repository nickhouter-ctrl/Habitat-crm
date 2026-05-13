/** Shared helpers to populate pickers in the deal/property/document/product forms. */
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, deals, products, projects, properties, users } from "@/lib/db/schema";

export type SelectOption = { id: string; name: string };

export type ProductOption = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  priceEur: string | null;
  costEur: string | null;
  vatRate: number;
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
    where: eq(products.isActive, true),
    columns: { id: true, name: true, category: true, unit: true, priceEur: true, costEur: true, vatRate: true },
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
