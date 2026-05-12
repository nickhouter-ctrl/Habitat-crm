/** Shared helpers to populate <select> options in the deal/property/document forms. */
import { asc, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, deals, properties, users } from "@/lib/db/schema";

export type SelectOption = { id: string; name: string };

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

export async function getDealFormOptions() {
  const [c, p, u] = await Promise.all([listContacts(), listProperties(), listUsers()]);
  return { contacts: c, properties: p, users: u };
}

export async function getPropertyFormOptions() {
  const [c, u] = await Promise.all([listContacts(), listUsers()]);
  return { contacts: c, users: u };
}

export async function getDocumentFormOptions() {
  const [c, d, p] = await Promise.all([listContacts(), listDeals(), listProperties()]);
  return { contacts: c, deals: d, properties: p };
}
