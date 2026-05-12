/** Shared helpers to populate <select> options in the deal/property forms. */
import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, properties, users } from "@/lib/db/schema";

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

export async function getDealFormOptions() {
  const [c, p, u] = await Promise.all([listContacts(), listProperties(), listUsers()]);
  return { contacts: c, properties: p, users: u };
}

export async function getPropertyFormOptions() {
  const [c, u] = await Promise.all([listContacts(), listUsers()]);
  return { contacts: c, users: u };
}
