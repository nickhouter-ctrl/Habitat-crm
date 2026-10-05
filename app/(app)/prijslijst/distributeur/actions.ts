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
import { prijsOpties, prijsVoorstelInvoer } from "@/lib/distributeur-invoer";
import { z } from "zod";

const TALEN: PrijslijstTaal[] = ["nl", "de", "en", "es"];

/** Begeleidende tekst in de taal van de klant; kort, het document doet de rest. */
const MAILTEKST: Record<PrijslijstTaal, { onderwerp: string; hallo: (n: string) => string; bijlage: string; groet: string }> = {
  nl: {
    onderwerp: "Habitat One — prijzen voor verkooppunten",
    hallo: (n) => `Beste ${n},`,
    bijlage: `In de bijlage vind je ons prijsvoorstel met jaarstaffels vanaf ${KORTING_VERKOOPPUNT}% en maximaal ${KORTING_SHOWROOM}% korting op afgesproken showroommateriaal. De korting verschilt per paneelmaat; de prijzen in het document zijn leidend. Adviesverkoopprijzen zijn vrijblijvend. Transport en definitieve afspraken bevestigen we vóór een bestelling.`,
    groet: "Met vriendelijke groet,",
  },
  de: {
    onderwerp: "Habitat One — Preise für Verkaufsstellen",
    hallo: (n) => `Hallo ${n},`,
    bijlage: `Im Anhang finden Sie unseren Preisvorschlag mit Jahresstaffeln ab ${KORTING_VERKOOPPUNT}% und bis zu ${KORTING_SHOWROOM}% Rabatt auf vereinbartes Showroommaterial. Rabatte sind größenabhängig; es gelten die Dokumentpreise. Verkaufspreisempfehlungen sind unverbindlich. Transport und endgültige Bedingungen bestätigen wir vor der Bestellung.`,
    groet: "Mit freundlichen Grüßen,",
  },
  en: {
    onderwerp: "Habitat One — prices for points of sale",
    hallo: (n) => `Dear ${n},`,
    bijlage: `Attached is our pricing proposal, with annual tiers starting at ${KORTING_VERKOOPPUNT}% and up to ${KORTING_SHOWROOM}% off agreed showroom panels. Discounts vary by size; the document prices apply. Recommended retail prices are non-binding. Transport and final terms are confirmed before ordering.`,
    groet: "Kind regards,",
  },
  es: {
    onderwerp: "Habitat One — precios para puntos de venta",
    hallo: (n) => `Hola ${n}:`,
    bijlage: `Adjunto encontrarás nuestra propuesta, con tramos anuales desde el ${KORTING_VERKOOPPUNT}% y hasta un ${KORTING_SHOWROOM}% en paneles de showroom acordados. El descuento depende de la medida; se aplican los precios del documento. Los precios recomendados no son vinculantes. Confirmaremos el transporte y las condiciones definitivas antes del pedido.`,
    groet: "Un saludo,",
  },
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;" })[c] ?? c);
}

// Met #document terug, zodat je na het versturen op het juiste tabblad landt.
const terug = (params: string): never => redirect(`/wederverkopers/prijzen?${params}#document`);

export async function mailDistributeurPrijslijst(formData: FormData) {
  const user=await requireModule("verkoopprijzen");

  const contactId = String(formData.get("contactId") ?? "");
  const serie = String(formData.get("serie") ?? "");
  const bericht = String(formData.get("bericht") ?? "").trim();
  const taalParam = String(formData.get("taal") ?? "");
  const parsed = prijsVoorstelInvoer.safeParse({staffel:formData.get("staffel")??undefined,extra:formData.get("extra")??undefined,serie});
  if (!parsed.success) return terug(`error=${encodeURIComponent("Controleer de prijsinstellingen.")}`);
  if (!z.string().uuid().safeParse(contactId).success || bericht.length > 10000) return terug(`error=${encodeURIComponent("Controleer klant en bericht.")}`);
  const opties = prijsOpties(parsed.data);
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!contact?.email) terug(`error=${encodeURIComponent("Deze klant heeft geen e-mailadres.")}`);

  // Taal uit het formulier, anders de voorkeurstaal van het contact, anders Spaans
  // — de meeste verkooppunten van de beurs zijn Spaans.
  const taal: PrijslijstTaal = TALEN.includes(taalParam as PrijslijstTaal)
    ? (taalParam as PrijslijstTaal)
    : TALEN.includes(contact!.preferredLanguage as PrijslijstTaal)
      ? (contact!.preferredLanguage as PrijslijstTaal)
      : "es";

  const { items, totaal } = await buildDistributeurItems(serie || "ALL", opties);
  if (totaal === 0) terug(`error=${encodeURIComponent("Geen panelen met een adviesprijs gevonden.")}`);

  const pdf = await renderDistributeurPrijslijst({
    items,
    ondertitel: serie || "Flexibel Stone",
    taal,
    opties,
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
  terug(`sent=1&${new URLSearchParams({staffel:parsed.data.staffel,extra:String(parsed.data.extra),serie})}`);
}
