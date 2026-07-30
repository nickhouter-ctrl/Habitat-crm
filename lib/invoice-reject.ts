/**
 * Een afgekeurde inkoopfactuur terugsturen naar de leverancier.
 *
 * Twee dingen die hier makkelijk misgaan en daarom expliciet zijn afgedekt:
 *
 * 1. **Het juiste adres.** Creadores stuurt facturen aan ons dóór, dus de
 *    afzender van de mail is soms de doorstuurder en niet de leverancier. Een
 *    afkeuring naar dat adres sturen betekent dat Creadores een verwijt krijgt
 *    over een factuur die zij alleen doorgaven.
 * 2. **De juiste taal en toon.** Dit gaat naar een zakelijke relatie. De tekst is
 *    een concept dat altijd nagelezen wordt vóór verzending.
 */
import { and, eq, ilike, or } from "drizzle-orm";

import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { companies, contacts, emailInbox } from "@/lib/db/schema";
import { brandedEmail, escapeHtml } from "@/lib/email";

/**
 * Domeinen die facturen alleen dóórsturen. Een afkeuring hoort nooit hierheen —
 * de leverancier zou het bericht nooit zien en de doorstuurder krijgt een verwijt
 * dat niet voor hem is.
 */
const FORWARDER_DOMAINS = [
  "habitat-one.com",
  "creadores",
  ...(process.env.FORWARDER_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean),
];

export function isForwarderAddress(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  return !!e && FORWARDER_DOMAINS.some((d) => e.includes(d));
}

export type EmailCandidate = {
  email: string;
  /** Waar dit adres vandaan komt, zodat de gebruiker het kan wegen. */
  source: string;
  /** Waarschijnlijk de doorstuurder in plaats van de leverancier. */
  uncertain: boolean;
};

/**
 * Alle bekende adressen voor deze leverancier, beste eerst. Het adres op de
 * factuur zélf gaat vóór de afzender van de mail: bij een doorgestuurde factuur
 * is dat laatste de verkeerde partij.
 */
export async function supplierEmailCandidates(args: {
  emailId: string;
  supplier: string | null;
  supplierTaxId: string | null;
  invoiceEmail: string | null;
}): Promise<EmailCandidate[]> {
  const out: EmailCandidate[] = [];
  const add = (email: string | null | undefined, source: string) => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    if (out.some((c) => c.email === e)) return;
    out.push({ email: e, source, uncertain: isForwarderAddress(e) });
  };

  add(args.invoiceEmail, "op de factuur");

  // Bekend in het CRM: op btw-nummer of op naam.
  const taxId = (args.supplierTaxId ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (taxId) {
    const viaBtw = await db
      .select({ email: companies.email, name: companies.name })
      .from(companies)
      .where(ilike(companies.vatNumber, `%${taxId}%`))
      .limit(1);
    if (viaBtw[0]) add(viaBtw[0].email, `bedrijf ${viaBtw[0].name} (btw-nummer)`);
  }
  if (args.supplier && args.supplier.length >= 4) {
    const viaNaam = await db
      .select({ email: companies.email, name: companies.name })
      .from(companies)
      .where(and(eq(companies.type, "supplier"), ilike(companies.name, `%${args.supplier}%`)))
      .limit(1);
    if (viaNaam[0]) add(viaNaam[0].email, `bedrijf ${viaNaam[0].name}`);

    const viaContact = await db
      .select({ email: contacts.email, name: contacts.name })
      .from(contacts)
      .where(or(ilike(contacts.name, `%${args.supplier}%`), eq(contacts.taxId, args.supplierTaxId ?? "—")))
      .limit(1);
    if (viaContact[0]) add(viaContact[0].email, `contact ${viaContact[0].name}`);
  }

  // Laatste redmiddel: de afzender van de mail.
  const mail = await db.query.emailInbox.findFirst({
    where: eq(emailInbox.id, args.emailId),
    columns: { fromEmail: true },
  });
  add(mail?.fromEmail, "afzender van de mail");

  // Zekere adressen eerst.
  return out.sort((a, b) => Number(a.uncertain) - Number(b.uncertain));
}

/* ─────────────────────────── de mail ─────────────────────────── */

type Lang = "es" | "nl" | "en";

/** Facturen horen naar het inkoop-postvak, niet naar hi@. */
const INKOOP_ADRES = (process.env.GMAIL_PURCHASE_USER ?? "purchase@habitat-one.com").trim();

const COPY: Record<Lang, {
  subject: (ref: string) => string;
  intro: (ref: string, datum: string) => string;
  lijstKop: string;
  slot: string;
  gegevensKop: string;
  dank: string;
}> = {
  es: {
    subject: (ref) => `Factura ${ref} — falta información para poder tramitarla`,
    intro: (ref, datum) =>
      `Hemos recibido su factura ${ref}${datum ? ` de fecha ${datum}` : ""}, pero todavía no podemos tramitarla porque falta la siguiente información obligatoria:`,
    lijstKop: "Falta:",
    slot: `Les rogamos que nos envíen una factura corregida a ${INKOOP_ADRES}. En cuanto la recibamos completa, entrará en nuestro circuito de pago.`,
    gegevensKop: "Para su próxima factura, nuestros datos de facturación son:",
    dank: "Muchas gracias por su colaboración.",
  },
  nl: {
    subject: (ref) => `Factuur ${ref} — nog niet te verwerken`,
    intro: (ref, datum) =>
      `We hebben je factuur ${ref}${datum ? ` van ${datum}` : ""} ontvangen, maar kunnen 'm nog niet verwerken omdat de volgende gegevens ontbreken:`,
    lijstKop: "Ontbreekt:",
    slot: `Stuur ons een aangepaste factuur op ${INKOOP_ADRES}. Zodra die compleet binnen is, gaat 'ie mee in de betaalronde.`,
    gegevensKop: "Voor je volgende factuur, onze factuurgegevens:",
    dank: "Bedankt alvast.",
  },
  en: {
    subject: (ref) => `Invoice ${ref} — cannot be processed yet`,
    intro: (ref, datum) =>
      `We received your invoice ${ref}${datum ? ` dated ${datum}` : ""}, but cannot process it yet because the following required information is missing:`,
    lijstKop: "Missing:",
    slot: `Please send a corrected invoice to ${INKOOP_ADRES}. Once we have it complete, it will enter our payment run.`,
    gegevensKop: "For your next invoice, our billing details are:",
    dank: "Thank you for your help.",
  },
};

/** Onze gegevens meesturen voorkomt dat dezelfde fout volgende keer terugkomt. */
function eigenGegevens(): string {
  return [COMPANY.legalName, `NIF ${COMPANY.vatNumber}`, COMPANY.address].filter(Boolean).join(" · ");
}

/**
 * Bouwt de conceptmail. Pure functie: het scherm kan de tekst live opnieuw
 * opbouwen als de gebruiker een punt aan- of uitvinkt, zonder de server.
 */
export function buildInvoiceRejectEmail(args: {
  lang?: Lang | null;
  supplier: string | null;
  reference: string | null;
  invoiceDate: string | null;
  /** Punten die de leverancier moet aanvullen. `key` is bewust een vrije string:
   *  de bevindingen komen uit jsonb en zijn dan niet meer getypeerd. */
  missing: { key: string; es: string; label: string }[];
  extraNote?: string | null;
}): { subject: string; html: string; text: string } {
  const t = COPY[args.lang && COPY[args.lang] ? args.lang : "es"];
  const ref = args.reference ?? "—";
  const punten = args.missing.map((m) => m.es || m.label).filter(Boolean);

  const tekst = [
    args.supplier ? `${args.supplier},` : "",
    "",
    t.intro(ref, args.invoiceDate ?? ""),
    "",
    ...punten.map((p) => `  • ${p}`),
    "",
    ...(args.extraNote?.trim() ? [args.extraNote.trim(), ""] : []),
    t.slot,
    "",
    `${t.gegevensKop} ${eigenGegevens()}`,
    "",
    t.dank,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const html = brandedEmail(`
    ${args.supplier ? `<p>${escapeHtml(args.supplier)},</p>` : ""}
    <p>${escapeHtml(t.intro(ref, args.invoiceDate ?? ""))}</p>
    <ul>${punten.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
    ${args.extraNote?.trim() ? `<p>${escapeHtml(args.extraNote.trim())}</p>` : ""}
    <p>${escapeHtml(t.slot)}</p>
    <p style="color:#666;font-size:13px">${escapeHtml(t.gegevensKop)}<br>${escapeHtml(eigenGegevens())}</p>
    <p>${escapeHtml(t.dank)}</p>
  `);

  return { subject: t.subject(ref), html, text: tekst };
}
