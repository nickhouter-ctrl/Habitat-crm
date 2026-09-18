/**
 * Het werk achter een prospect-import: bestand lezen, kijken wat er al staat,
 * en de droogloop maken. Los van `actions.ts`, omdat dat bestand `"use server"`
 * is en dus alleen server actions mag exporteren — terwijl de pagina deze
 * functies ook nodig heeft om het voorbeeld te tonen.
 */
// Bewust géén "server-only": de proef- en controlescripts (npx tsx) draaien deze
// code ook, en dat is waardevol — juist de SQL hieronder wil je kunnen aflopen
// tegen de echte database. Het blijft serverwerk: dit bestand importeert
// `@/lib/db`, dus in een clientbundel loopt het sowieso stuk.
import { inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, emailSuppressions, prospectImports, prospects } from "@/lib/db/schema";
import { parseTable, splitHeader } from "@/lib/import/parse-table";
import { normalizeEmail } from "@/lib/leads/normalize";
import { rowToProspect, type ProspectField, type ProspectRowIn } from "@/lib/leads/prospect-columns";
import { planProspectImport, type BekendeGegevens, type ImportPlan } from "@/lib/leads/prospect-import";
import { fetchProspectListBytes } from "@/lib/storage";
import { SUPPLIER_KEY_SQL } from "@/lib/supplier-key";

export type Batch = typeof prospectImports.$inferSelect;

/** Hoeveel nieuwe rijen we op het scherm laten zien vóór het bevestigen. */
export const VOORBEELD_RIJEN = 25;

const stadSleutel = (stad: string | null | undefined) =>
  (stad ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toLowerCase();

export interface GelezenBestand {
  koppen: string[];
  rijen: ProspectRowIn[];
  bladen: string[];
  /** Ruwe rijen van het gekozen blad — voor de kolomkeuze met voorbeeldwaarden. */
  ruw: string[][];
}

/** Het bestand lezen en de gekozen mapping toepassen. */
export async function leesBestand(batch: Batch, opts?: { maxRows?: number }): Promise<GelezenBestand> {
  const bytes = await fetchProspectListBytes(batch.storagePath);
  if (!bytes) throw new Error("Het bestand staat niet meer in de opslag.");
  const tabel = parseTable(bytes, batch.filename, opts);
  const blad = tabel.sheets.find((s) => s.name === batch.sheetName) ?? tabel.sheets[0];
  if (!blad) throw new Error("Blad niet gevonden in het bestand.");
  const { headers, rows } = splitHeader(blad, batch.headerRow);
  const mapping = (batch.mapping ?? []) as (ProspectField | null)[];
  return {
    koppen: headers,
    rijen: rows.map((r) => rowToProspect(r, mapping, headers)),
    bladen: tabel.sheets.map((s) => s.name),
    ruw: rows,
  };
}

/**
 * Wat staat er al? Niet de hele tabel inladen, maar alleen de adressen die in
 * dit bestand voorkomen. Bij 7.000 adressen zijn dat een paar tientallen
 * queries van niks in plaats van drie volle tabellen in het geheugen.
 */
export async function bekendeGegevens(rijen: ProspectRowIn[]): Promise<BekendeGegevens> {
  const adressen = [...new Set(rijen.map((r) => normalizeEmail(r.email)).filter((e): e is string => !!e))];
  const zonderAdres = rijen.some((r) => !normalizeEmail(r.email) && r.companyName);

  const uit: BekendeGegevens = {
    prospectEmails: new Set(),
    contactEmails: new Set(),
    suppressed: new Set(),
    prospectCompanyKeys: new Set(),
  };

  // Gebonden parameters, geen samengestelde SQL: de waarden komen uit een
  // bestand van een derde, en die horen nooit als tekst in een query.
  for (let i = 0; i < adressen.length; i += 1_000) {
    const blok = adressen.slice(i, i + 1_000);
    const [p, c, s] = await Promise.all([
      db.select({ e: sql<string>`lower(${prospects.email})` }).from(prospects).where(inArray(sql`lower(${prospects.email})`, blok)),
      db.select({ e: sql<string>`lower(${contacts.email})` }).from(contacts).where(inArray(sql`lower(${contacts.email})`, blok)),
      db
        .select({ e: sql<string>`lower(${emailSuppressions.email})` })
        .from(emailSuppressions)
        .where(inArray(sql`lower(${emailSuppressions.email})`, blok)),
    ]);
    for (const r of p) uit.prospectEmails.add(r.e);
    for (const r of c) uit.contactEmails.add(r.e);
    for (const r of s) uit.suppressed.add(r.e);
  }

  // Bedrijven zonder adres vergelijken op dezelfde sleutel als in JS. De
  // SQL-variant van supplierKey() staat in lib/supplier-key.ts, precies zodat
  // beide kanten hetzelfde denken over "Estudio X S.L." en "estudio x sl".
  if (zonderAdres) {
    const rijenUitDb = (await db.execute(sql`
      select ${sql.raw(SUPPLIER_KEY_SQL("company_name"))} as k, city as stad
      from prospects where email is null
    `)) as unknown as { k: string; stad: string | null }[];
    for (const r of rijenUitDb) uit.prospectCompanyKeys.add(`${r.k}|${stadSleutel(r.stad)}`);
  }
  return uit;
}

export interface Droogloop {
  plan: ImportPlan;
  koppen: string[];
  bladen: string[];
  ruw: string[][];
}

/** Bestand + database → het volledige beeld van wat de import gaat doen. */
export async function droogloop(batch: Batch): Promise<Droogloop> {
  const gelezen = await leesBestand(batch);
  const plan = planProspectImport(gelezen.rijen, await bekendeGegevens(gelezen.rijen));
  return { plan, koppen: gelezen.koppen, bladen: gelezen.bladen, ruw: gelezen.ruw };
}
