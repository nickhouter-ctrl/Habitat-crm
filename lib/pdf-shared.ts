/* Gedeelde bouwstenen voor de klant-PDF's (begroting, voortgang, documenten):
 * bedrag-conversie vanuit numeric-kolommen, fase-sleutels, contactgegevens,
 * datum-stempel voor bestandsnamen en de vaste geldkolom-layout. */
import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import type { ReportColumn } from "@/lib/report-pdf";

/**
 * Resultaat van een klant-PDF-renderer: de PDF zelf plus wat de aanroeper
 * nodig heeft om te downloaden of te mailen. `contactEmail` is `null` als het
 * project geen contact (met e-mailadres) heeft.
 */
export type ClientPdf = {
  buffer: Buffer;
  filename: string;
  projectName: string;
  contactEmail: string | null;
};

/**
 * Bedrag uit een Drizzle `numeric`-kolom (string) of number naar een getal;
 * `null`/`undefined` telt als 0. Zelfde afronding als `Number()` — geen extra
 * formattering, daarvoor is `formatEUR` (lib/utils.ts).
 */
export function amountEur(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

/**
 * Som van de `amountEur`-kolom over een set (begrotings)regels.
 */
export function sumAmountEur(lines: readonly { amountEur: string | number | null }[]): number {
  return lines.reduce((s, l) => s + amountEur(l.amountEur), 0);
}

/**
 * Normaliseert een fasenaam voor het groeperen van regels: `null`/`undefined`
 * wordt een lege string, spaties eromheen tellen niet mee.
 */
export function phaseKey(phase: string | null | undefined): string {
  return (phase ?? "").trim();
}

/**
 * Datum-stempel (JJJJ-MM-DD, vandaag) voor in PDF-bestandsnamen.
 */
export function pdfDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Naam + e-mailadres van het projectcontact, of `null` zonder (gevonden)
 * contact. Haalt bewust alleen deze twee kolommen op.
 */
export async function getPdfContact(
  contactId: string | null | undefined,
): Promise<{ name: string | null; email: string | null } | null> {
  if (!contactId) return null;
  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    columns: { name: true, email: true },
  });
  return c ?? null;
}

/**
 * Vaste kolom-layout voor een tweekoloms geldtabel (omschrijving links,
 * bedrag rechts) — zoals op de begroting-PDF. Geeft telkens een verse array
 * terug zodat tabellen elkaars kolommen niet delen.
 */
export function amountTableColumns(leftHeader = "", amountHeader = "Bedrag"): ReportColumn[] {
  return [
    { header: leftHeader, flex: 4 },
    { header: amountHeader, align: "right", flex: 1.3 },
  ];
}
