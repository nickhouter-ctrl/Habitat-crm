/**
 * De aannemingsovereenkomst die de klant online ondertekent.
 *
 * Er is hier BEWUST geen nieuwe juridische tekst geschreven. De artikelen zijn
 * exact de voorbehouden uit `lib/quote-clauses.ts` die al onder elke gecalculeerde
 * offerte staan — alleen genummerd en per stuk vastgelegd in plaats van als één
 * lap tekst in `documents.notes`.
 *
 * ⚠️ Die voorbehouden zijn nooit door een advocaat getoetst. Zolang ze onderaan
 * een offerte staan is dat een commercieel risico; zodra een klant ze ondertekent
 * wordt het een juridisch document. Twee punten die vóór de eerste echte klant
 * beantwoord moeten zijn:
 *
 *  - Derecho de desistimiento: een op afstand gesloten overeenkomst met een
 *    consument kent doorgaans 14 dagen herroepingsrecht. Dat botst met de termijn
 *    "20% bij opdracht, vóór aanvang van het sloopwerk" — binnen die termijn
 *    beginnen vereist een uitdrukkelijk verzoek van de klant in voorgeschreven vorm.
 *  - Cláusulas abusivas: meerwerk/stelposten "op regiebasis" laat de aannemer de
 *    prijs eenzijdig bepalen; tegenover een consument is dat kwetsbaar.
 *
 * Daarom staat de versie op "-concept" en is `EXTRA_ARTICLES` een lege plakplek:
 * de advocaat kan artikelen aanleveren zonder code- of migratiewijziging. Bump
 * daarna `CONTRACT_TERMS_VERSION` — oude handtekeningen dragen hun eigen versie
 * en tekst mee en veranderen dus niet mee.
 */
import type { DocumentLineItem, DocumentSignatureSnapshot } from "@/lib/db/schema";
import { canonicalJson, sha256Hex } from "@/lib/canonical-json";
import { type QuoteLang, quoteClauseList } from "@/lib/quote-clauses";

export const CONTRACT_TERMS_VERSION = "2026-09-concept";

/** Plakplek voor de advocaat: extra artikelen ná de bestaande voorbehouden. */
export const EXTRA_ARTICLES: Record<QuoteLang, string[]> = { nl: [], en: [], es: [] };

/** De artikelen zoals ze genummerd op het scherm en op de PDF komen. */
export function contractArticles(lang: QuoteLang): string[] {
  return [...quoteClauseList(lang), ...EXTRA_ARTICLES[lang]];
}

export type ConsentKey = "meerwerk" | "onvoorzien" | "stelposten" | "betaling";

/**
 * De vinkjes. Elk is een letterlijke samenvatting van een artikel dat de klant
 * er vlak boven leest.
 *
 * Meerwerk en onvoorziene kosten staan apart, ook al komen ze uit hetzelfde
 * artikel: dat waren de twee dingen waar Nick expliciet om vroeg, en één
 * gecombineerd vinkje laat een klant achteraf zeggen dat hij het anders begreep.
 */
const CHECKS: Record<QuoteLang, Record<ConsentKey, string>> = {
  nl: {
    meerwerk:
      "Ik begrijp dat meerwerk uitsluitend wordt uitgevoerd na mijn schriftelijke akkoord, en dat het apart in rekening wordt gebracht.",
    onvoorzien:
      "Ik begrijp dat zich tijdens een verbouwing onvoorziene kosten kunnen voordoen — zoals verborgen gebreken aan elektra, leidingwerk of riolering, of een hardere ondergrond dan verwacht — en dat die volgens de artikelen hierboven worden verrekend.",
    stelposten:
      "Ik begrijp dat bij stelposten materiaal van gemiddelde kwaliteit is inbegrepen, en dat een duurdere keuze als meerprijs en een goedkopere keuze als minderprijs wordt verrekend.",
    betaling:
      "Ik ga akkoord met het betalingsschema hierboven: elke termijn wordt voldaan vóór aanvang van de betreffende fase.",
  },
  en: {
    meerwerk:
      "I understand that additional work is only carried out after my written approval, and that it is charged separately.",
    onvoorzien:
      "I understand that unforeseen costs may arise during a renovation — such as hidden defects in the electrics, plumbing or drainage, or ground that is harder than expected — and that these are settled in accordance with the articles above.",
    stelposten:
      "I understand that provisional sums cover mid-range materials, and that a more expensive choice is charged as an extra while a cheaper choice is deducted.",
    betaling:
      "I agree to the payment schedule above: each instalment is paid before the corresponding phase starts.",
  },
  es: {
    meerwerk:
      "Entiendo que los trabajos adicionales solo se ejecutan previa conformidad por escrito por mi parte, y que se facturan por separado.",
    onvoorzien:
      "Entiendo que durante una reforma pueden surgir costes imprevistos — como vicios ocultos en la instalación eléctrica, la fontanería o el saneamiento, o un terreno más duro de lo previsto — y que se liquidan conforme a los artículos anteriores.",
    stelposten:
      "Entiendo que las partidas alzadas contemplan material de calidad media, y que una elección más cara se factura como incremento y una más económica se descuenta.",
    betaling:
      "Acepto el calendario de pagos anterior: cada plazo se abona antes de iniciar la fase correspondiente.",
  },
};

export const CONSENT_KEYS: ConsentKey[] = ["meerwerk", "onvoorzien", "stelposten", "betaling"];

export function contractChecks(lang: QuoteLang): { key: ConsentKey; text: string }[] {
  return CONSENT_KEYS.map((key) => ({ key, text: CHECKS[lang][key] }));
}

/** Vingerafdruk over precies wat er getoond werd. Zie `lib/canonical-json.ts`. */
export function contractSnapshotHash(snap: DocumentSignatureSnapshot): string {
  return sha256Hex(canonicalJson(snap));
}

/**
 * Bevries de offerte zoals hij nu is. Gebruikt door zowel het tekenen als de
 * gewone acceptatie, zodat beide niveaus hetzelfde bewijs opleveren — alleen de
 * ceremonie eromheen verschilt.
 */
export function buildSnapshot(
  doc: {
    docNumber: string | null;
    title: string | null;
    items: DocumentLineItem[] | null;
    notes: string | null;
    subtotalEur: string;
    taxEur: string;
    totalEur: string;
    paymentSchedule: { label: string; pct: number; amountEur: number }[] | null;
  },
  lang: QuoteLang,
): DocumentSignatureSnapshot {
  return {
    docNumber: doc.docNumber,
    title: doc.title,
    items: doc.items ?? [],
    notes: doc.notes,
    subtotalEur: doc.subtotalEur,
    taxEur: doc.taxEur,
    totalEur: doc.totalEur,
    paymentSchedule: doc.paymentSchedule ?? null,
    articles: contractArticles(lang),
  };
}

/**
 * De contracttaal. `quoteClauses` kent geen Duits, dus een Duitstalige klant
 * krijgt Engels — precies zoals `documents.notes` zich vandaag al gedraagt.
 * Welke taal juridisch leidend is, is een vraag voor de advocaat.
 */
export function contractLang(preferred: string | null | undefined): QuoteLang {
  return preferred === "nl" || preferred === "en" || preferred === "es" ? preferred : preferred === "de" ? "en" : "es";
}

/** Kopteksten voor de ondertekenpagina en de PDF. */
export const CONTRACT_T: Record<
  QuoteLang,
  {
    heading: string;
    parties: string;
    contractor: string;
    client: string;
    object: string;
    price: string;
    schedule: string;
    articles: string;
    article: string;
    sign: string;
    signIntro: string;
    yourName: string;
    yourEmail: string;
    yourTaxId: string;
    submit: string;
    signedOn: string;
    evidence: string;
    fingerprint: string;
    exVat: string;
    vat: string;
    incVat: string;
    alreadySigned: string;
    expired: string;
    stale: string;
    missingChecks: string;
    missingName: string;
    missingEmail: string;
    tooMany: string;
    downloadPdf: string;
    backToQuote: string;
  }
> = {
  nl: {
    heading: "Aannemingsovereenkomst",
    parties: "Partijen",
    contractor: "Aannemer",
    client: "Opdrachtgever",
    object: "Het werk",
    price: "Aanneemsom",
    schedule: "Betalingsschema",
    articles: "Artikelen",
    article: "Artikel",
    sign: "Ondertekenen",
    signIntro:
      "Lees de artikelen hierboven. Bevestig elk punt en vul uw naam in; daarmee ondertekent u deze overeenkomst.",
    yourName: "Uw volledige naam",
    yourEmail: "Uw e-mailadres",
    yourTaxId: "NIE / NIF (optioneel)",
    submit: "Ondertekenen",
    signedOn: "Ondertekend op",
    evidence: "Bewijs van elektronische ondertekening",
    fingerprint: "Vingerafdruk document",
    exVat: "Excl. btw",
    vat: "BTW",
    incVat: "Incl. btw",
    alreadySigned: "Deze overeenkomst is al ondertekend.",
    expired: "Deze link is verlopen. Neem contact met ons op voor een nieuwe offerte.",
    stale: "De offerte is bijgewerkt sinds u deze pagina opende. Ververs de pagina en lees hem opnieuw door.",
    missingChecks: "Bevestig alle punten voordat u ondertekent.",
    missingName: "Vul uw volledige naam in (voor- en achternaam).",
    missingEmail: "Vul een geldig e-mailadres in.",
    tooMany: "Te veel pogingen. Probeer het over een uur opnieuw.",
    downloadPdf: "Overeenkomst als PDF",
    backToQuote: "Terug naar de offerte",
  },
  en: {
    heading: "Construction contract",
    parties: "Parties",
    contractor: "Contractor",
    client: "Client",
    object: "The works",
    price: "Contract price",
    schedule: "Payment schedule",
    articles: "Articles",
    article: "Article",
    sign: "Sign",
    signIntro:
      "Please read the articles above. Confirm each point and enter your name; this constitutes your signature.",
    yourName: "Your full name",
    yourEmail: "Your email address",
    yourTaxId: "NIE / NIF (optional)",
    submit: "Sign",
    signedOn: "Signed on",
    evidence: "Electronic signature record",
    fingerprint: "Document fingerprint",
    exVat: "Excl. VAT",
    vat: "VAT",
    incVat: "Incl. VAT",
    alreadySigned: "This contract has already been signed.",
    expired: "This link has expired. Please contact us for an up-to-date quote.",
    stale: "The quote was updated since you opened this page. Please refresh and read it again.",
    missingChecks: "Please confirm every point before signing.",
    missingName: "Please enter your full name (first and last).",
    missingEmail: "Please enter a valid email address.",
    tooMany: "Too many attempts. Please try again in an hour.",
    downloadPdf: "Contract as PDF",
    backToQuote: "Back to the quote",
  },
  es: {
    heading: "Contrato de obra",
    parties: "Partes",
    contractor: "Contratista",
    client: "Cliente",
    object: "La obra",
    price: "Precio de la obra",
    schedule: "Calendario de pagos",
    articles: "Artículos",
    article: "Artículo",
    sign: "Firmar",
    signIntro:
      "Lea los artículos anteriores. Confirme cada punto e introduzca su nombre; con ello firma este contrato.",
    yourName: "Su nombre completo",
    yourEmail: "Su correo electrónico",
    yourTaxId: "NIE / NIF (opcional)",
    submit: "Firmar",
    signedOn: "Firmado el",
    evidence: "Registro de firma electrónica",
    fingerprint: "Huella del documento",
    exVat: "Sin IVA",
    vat: "IVA",
    incVat: "Con IVA",
    alreadySigned: "Este contrato ya ha sido firmado.",
    expired: "Este enlace ha caducado. Póngase en contacto con nosotros para un presupuesto actualizado.",
    stale: "El presupuesto se ha actualizado desde que abrió esta página. Actualice y vuelva a leerlo.",
    missingChecks: "Confirme todos los puntos antes de firmar.",
    missingName: "Introduzca su nombre completo (nombre y apellidos).",
    missingEmail: "Introduzca un correo electrónico válido.",
    tooMany: "Demasiados intentos. Inténtelo de nuevo dentro de una hora.",
    downloadPdf: "Contrato en PDF",
    backToQuote: "Volver al presupuesto",
  },
};
