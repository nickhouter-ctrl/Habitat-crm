"use server";

/**
 * De prijslijst voor verkooppunten naar een klant mailen.
 *
 * Bedoeld voor de opvolging na de beurs: iemand die onze producten wil
 * verkopen, krijgt het document in zijn eigen taal. Geen los mailprogramma,
 * geen handmatig aanhangen — en de verzonden lijst is altijd de actuele.
 */
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { requireModule } from "@/lib/auth/guards";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { buildDistributeurItems } from "@/lib/distributeur-prijslijst-data";
import {
  renderDistributeurPrijslijst,
  type PrijslijstTaal,
} from "@/lib/distributeur-prijslijst-pdf";
import { sendEmail } from "@/lib/email";
import { KORTING_SHOWROOM, KORTING_VERKOOPPUNT } from "@/lib/distributeur-prijzen";

const TALEN: PrijslijstTaal[] = ["nl", "de", "en", "es"];

/** Begeleidende tekst in de taal van de klant; kort, het document doet de rest. */
const MAILTEKST: Record<PrijslijstTaal, { onderwerp: string; hallo: (n: string) => string; bijlage: string; groet: string }> = {
  nl: {
    onderwerp: "Habitat One — prijzen voor verkooppunten",
    hallo: (n) => `Beste ${n},`,
    bijlage: `In de bijlage vind je onze prijzen voor verkooppunten: ${KORTING_VERKOOPPUNT}% onder de vaste adviesprijs, en ${KORTING_SHOWROOM}% korting op materiaal voor je eigen showroom.`,
    groet: "Met vriendelijke groet,",
  },
  de: {
    onderwerp: "Habitat One — Preise für Verkaufsstellen",
    hallo: (n) => `Hallo ${n},`,
    bijlage: `Im Anhang finden Sie unsere Preise für Verkaufsstellen: ${KORTING_VERKOOPPUNT}% unter dem festen Endkundenpreis und ${KORTING_SHOWROOM}% Rabatt auf Material für Ihren eigenen Showroom.`,
    groet: "Mit freundlichen Grüßen,",
  },
  en: {
    onderwerp: "Habitat One — prices for points of sale",
    hallo: (n) => `Dear ${n},`,
    bijlage: `Attached you will find our prices for points of sale: ${KORTING_VERKOOPPUNT}% below the fixed recommended price, and ${KORTING_SHOWROOM}% off material for your own showroom.`,
    groet: "Kind regards,",
  },
  es: {
    onderwerp: "Habitat One — precios para puntos de venta",
    hallo: (n) => `Hola ${n}:`,
    bijlage: `Adjunto encontrarás nuestros precios para puntos de venta: un ${KORTING_VERKOOPPUNT}% por debajo del precio recomendado fijo, y un ${KORTING_SHOWROOM}% de descuento en material para tu propio showroom.`,
    groet: "Un saludo,",
  },
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;" })[c] ?? c);
}

// Met #document terug, zodat je na het versturen op het juiste tabblad landt.
const terug = (params: string) => redirect(`/prijslijst/distributeur?${params}#document`);

export async function mailDistributeurPrijslijst(formData: FormData) {
  await requireModule("prijzen");

  const contactId = String(formData.get("contactId") ?? "");
  const serie = String(formData.get("serie") ?? "");
  const bericht = String(formData.get("bericht") ?? "").trim();
  const taalParam = String(formData.get("taal") ?? "");

  if (!contactId) terug(`error=${encodeURIComponent("Kies een klant.")}`);
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!contact?.email) terug(`error=${encodeURIComponent("Deze klant heeft geen e-mailadres.")}`);

  // Taal uit het formulier, anders de voorkeurstaal van het contact, anders Spaans
  // — de meeste verkooppunten van de beurs zijn Spaans.
  const taal: PrijslijstTaal = TALEN.includes(taalParam as PrijslijstTaal)
    ? (taalParam as PrijslijstTaal)
    : TALEN.includes(contact!.preferredLanguage as PrijslijstTaal)
      ? (contact!.preferredLanguage as PrijslijstTaal)
      : "es";

  const { items, totaal } = await buildDistributeurItems(serie || "ALL");
  if (totaal === 0) terug(`error=${encodeURIComponent("Geen panelen met een adviesprijs gevonden.")}`);

  const pdf = await renderDistributeurPrijslijst({
    items,
    ondertitel: serie || "Flexibel Stone",
    taal,
  });

  const t = MAILTEKST[taal];
  const naam = contact!.name?.split(" ")[0] || contact!.name || "";
  const html = `
    <p>${t.hallo(escapeHtml(naam))}</p>
    ${bericht ? `<p>${escapeHtml(bericht).replace(/\n/g, "<br/>")}</p>` : ""}
    <p>${escapeHtml(t.bijlage)}</p>
    <p>${escapeHtml(t.groet)}<br/>${COMPANY.name}</p>
  `;

  const res = await sendEmail({
    to: contact!.email!,
    subject: t.onderwerp,
    html,
    text: `${t.hallo(naam)}\n\n${bericht ? bericht + "\n\n" : ""}${t.bijlage}\n\n${t.groet}\n${COMPANY.name}`,
    attachments: [
      {
        filename: `habitat-one-verkooppunten-${taal}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  if (!res.sent) terug(`error=${encodeURIComponent(`Versturen mislukt: ${res.reason ?? "onbekend"}`)}`);
  terug("sent=1");
}
