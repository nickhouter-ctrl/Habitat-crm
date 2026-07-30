/**
 * Beoordeelt een BINNENGEKOMEN inkoopfactuur: staat erop wat erop moet staan?
 *
 * (Niet te verwarren met `lib/invoice-validation.ts` — dat gaat over onze eigen
 * UITGAANDE facturen naar klanten.)
 *
 * Bewust een pure functie zonder database of netwerk: het oordeel moet
 * herhaalbaar en zonder API-sleutel te testen zijn. De AI leest alleen uit, de
 * regels hieronder oordelen.
 *
 * Elke regel draagt zijn eigen Spaanse formulering, want die gaat één-op-één de
 * mail naar de leverancier in.
 */
import type { AiInvoiceFields, AiInvoiceRead, AiReadError } from "@/lib/ai-invoice-extract";
import { COMPANY } from "@/lib/company";

/** Stabiele sleutels: ze staan opgeslagen in de database. Nooit hernoemen. */
export type CheckKey =
  | "invoice_number"
  | "invoice_date"
  | "supplier_name"
  | "supplier_tax_id"
  | "supplier_address"
  | "recipient_name"
  | "recipient_tax_id"
  | "base_imponible"
  | "vat"
  | "total"
  | "totals_consistent"
  | "is_final_invoice"
  | "work_description"
  | "hours_detail"
  | "project_reference"
  | "payment_iban"
  | "iban_checksum"
  | "iban_changed"
  | "simplified_invoice"
  | "duplicate"
  | "read_failed";

export type Check = {
  key: CheckKey;
  /** Nederlands label voor het scherm. */
  label: string;
  severity: "blocking" | "warning";
  ok: boolean;
  /** Niet van toepassing op deze factuur (bv. urenregel op een materiaalfactuur). */
  skipped?: boolean;
  /** Wat er wél gevonden is — geeft context in het scherm. */
  found?: string | null;
  /** De zin die in de mail naar de leverancier komt. */
  es: string;
  /** Intern probleem: nooit naar de leverancier mailen. */
  internal?: boolean;
};

export type InvoiceVerdict = {
  /** ok = klaar om goed te keuren · warn = let op · reject = incompleet · unreadable = niet gelezen */
  status: "ok" | "warn" | "reject" | "unreadable";
  checks: Check[];
  /** Gefaalde blokkerende punten die je aan de leverancier kunt melden. */
  mailable: Check[];
  readOk: boolean;
  readError: AiReadError | null;
};

export type CheckContext = {
  /** Zoektermen van alle projecten — zie `matchProjectFromHint`. */
  projectMatched: boolean;
  /** IBAN's die deze leverancier eerder gebruikte (genormaliseerd). */
  knownIbans?: string[];
  /** Referentie van een bestaande inkooporder met hetzelfde factuurnummer. */
  duplicateOf?: string | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Woorden die op zichzelf niets zeggen. Een omschrijving die ALLEEN uit deze
 * woorden bestaat ("trabajos varios", "mano de obra") vertelt ons niet waar de
 * kosten voor waren; zodra er één inhoudelijk woord bij staat (een werf, een
 * materiaal) is het bruikbaar.
 */
const VAGUE_WORD =
  "(?:trabajos?|mano de obra|varios|servicios?|obra|reforma|materiales?|horas|jornales?|suministros?|factura|de|del|la|el|los|las|y|en|por)";
const VAGUE = new RegExp(`^${VAGUE_WORD}(?:[\\s.,;:-]+${VAGUE_WORD})*[\\s.,;:-]*$`);

/**
 * Spaanse NIF/CIF/NIE plausibel? Controleert het formaat en — bij DNI/NIE — de
 * controleletter. Een buitenlands btw-nummer (landcode + cijfers) telt ook.
 * Bewust geen harde CIF-checksum: die kent uitzonderingen per rechtsvorm en een
 * onterechte afkeuring kost meer dan een gemiste.
 */
export function isPlausibleTaxId(raw: string | null | undefined): boolean {
  const v = (raw ?? "").toUpperCase().replace(/[\s.\-/]/g, "");
  if (v.length < 8) return false;
  const LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

  // DNI: 8 cijfers + controleletter
  const dni = v.match(/^(\d{8})([A-Z])$/);
  if (dni) return LETTERS[Number(dni[1]) % 23] === dni[2];

  // NIE: X/Y/Z + 7 cijfers + controleletter
  const nie = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nie) {
    const prefix = { X: "0", Y: "1", Z: "2" }[nie[1]]!;
    return LETTERS[Number(prefix + nie[2]) % 23] === nie[3];
  }

  // CIF: letter + 7 cijfers + cijfer/letter
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return true;
  // Buitenlands btw-nummer: landcode + minimaal 6 tekens
  if (/^[A-Z]{2}[0-9A-Z]{6,}$/.test(v)) return true;
  return false;
}

/** IBAN-controlegetal (mod-97). Faalt bij een leesfout van één teken. */
export function isValidIban(raw: string | null | undefined): boolean {
  const v = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z]{2}\d{2}[0-9A-Z]{10,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // Stapsgewijs modulo, want het getal past niet in een Number.
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** Ons eigen NIF zonder landcode, om de ontvanger op de factuur te herkennen. */
const OWN_TAX_ID = COMPANY.vatNumber.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^ES/, "");

function check(c: Check): Check {
  return c;
}

/**
 * Velt het oordeel. `read` is de envelope van de uitlezing — een mislukte
 * uitlezing levert NOOIT een afkeuring op, want dan weten we niets over de
 * factuur zelf.
 */
export function evaluateInvoice(read: AiInvoiceRead, ctx: CheckContext): InvoiceVerdict {
  if (!read.ok) {
    return {
      status: "unreadable",
      readOk: false,
      readError: read.error,
      mailable: [],
      checks: [
        check({
          key: "read_failed",
          label: `De factuur kon niet uitgelezen worden (${read.error}) — handmatig beoordelen`,
          severity: "warning",
          ok: false,
          internal: true,
          es: "",
        }),
      ],
    };
  }

  const f = read.fields;

  // Triage: mist een document factuurnummer, datum én bedrag, dan is het geen
  // factuur met vijftien gebreken maar een mislukte uitlezing. Zonder deze regel
  // sturen we iemand een lijst van vijftien verwijten omdat de scan slecht was.
  const nothingRead = !f.invoiceNumber && !f.invoiceDate && f.total == null;
  if (nothingRead || f.legible === false) {
    return {
      status: "unreadable",
      readOk: true,
      readError: null,
      mailable: [],
      checks: [
        check({
          key: "read_failed",
          label: f.legible === false
            ? `Het document is slecht leesbaar${f.readNotes ? ` — ${f.readNotes}` : ""}`
            : "Er kwam geen factuurnummer, datum of bedrag uit — handmatig beoordelen",
          severity: "warning",
          ok: false,
          internal: true,
          es: "",
        }),
      ],
    };
  }

  const isSimplified = norm(f.documentKind) === "simplificada";
  const notAnInvoice = ["proforma", "presupuesto", "albaran"].includes(norm(f.documentKind));
  // Btw-verlegging (inversión del sujeto pasivo) betekent wettelijk GEEN btw op
  // de factuur. Zonder deze uitzondering keuren we elke onderaannemersfactuur af.
  const vatExempt = !!f.vatExemptionNote;
  const iban = f.iban ?? null;
  const noIbanNeeded = /efectivo|contado|domicilia|tarjeta|metalico/i.test(f.paymentMethod ?? "");

  const checks: Check[] = [
    check({
      key: "invoice_number",
      label: "Factuurnummer",
      severity: "blocking",
      ok: !!f.invoiceNumber,
      found: f.invoiceNumber,
      es: "el número de factura (serie y número)",
    }),
    check({
      key: "invoice_date",
      label: "Factuurdatum",
      severity: "blocking",
      ok: !!f.invoiceDate,
      found: f.invoiceDate,
      es: "la fecha de expedición de la factura",
    }),
    check({
      key: "supplier_name",
      label: "Naam van de leverancier",
      severity: "blocking",
      ok: (f.supplierLegalName ?? f.supplier ?? "").trim().length >= 3,
      found: f.supplierLegalName ?? f.supplier,
      es: "el nombre o razón social completo del emisor",
    }),
    check({
      key: "supplier_tax_id",
      label: "NIF/CIF van de leverancier",
      severity: "blocking",
      ok: isPlausibleTaxId(f.supplierTaxId),
      found: f.supplierTaxId,
      es: "el NIF/CIF del emisor",
    }),
    check({
      key: "supplier_address",
      label: "Adres van de leverancier",
      severity: "blocking",
      // Een adres zonder cijfer is bijna altijd onvolledig (geen huisnummer).
      ok: (f.supplierAddress ?? "").trim().length >= 10 && /\d/.test(f.supplierAddress ?? ""),
      found: f.supplierAddress,
      es: "el domicilio fiscal completo del emisor",
    }),
    check({
      key: "recipient_name",
      label: "Onze naam als ontvanger",
      severity: "blocking",
      // Een factura simplificada (ticket) hoeft wettelijk geen klantgegevens te
      // bevatten — die dus niet afkeuren, wel signaleren.
      skipped: isSimplified,
      ok: isSimplified || /habitatone|creadores|sorprendentes/.test(norm(f.recipientName).replace(/[^a-z]/g, "")),
      found: f.recipientName,
      es: `los datos completos del destinatario: ${COMPANY.legalName}`,
    }),
    check({
      key: "recipient_tax_id",
      label: "Ons NIF als ontvanger",
      severity: "blocking",
      skipped: isSimplified,
      ok:
        isSimplified ||
        (f.recipientTaxId ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^ES/, "") === OWN_TAX_ID,
      found: f.recipientTaxId,
      es: `el NIF del destinatario: ${COMPANY.vatNumber}`,
    }),
    check({
      key: "base_imponible",
      label: "Base imponible (bedrag ex. btw)",
      severity: "blocking",
      ok: f.subtotal != null && f.subtotal > 0,
      found: f.subtotal?.toFixed(2) ?? null,
      es: "la base imponible (importe sin IVA)",
    }),
    check({
      key: "vat",
      label: vatExempt ? "Btw-verlegging vermeld" : "IVA-tarief en -bedrag",
      severity: "blocking",
      ok: vatExempt || (f.vatRate != null && f.vatAmount != null),
      found: vatExempt ? f.vatExemptionNote : f.vatRate != null ? `${f.vatRate}% · ${f.vatAmount ?? "?"}` : null,
      es: "el tipo de IVA aplicado (%) y la cuota de IVA en euros",
    }),
    check({
      key: "total",
      label: "Totaalbedrag",
      severity: "blocking",
      ok: f.total != null && f.total > 0,
      found: f.total?.toFixed(2) ?? null,
      es: "el importe total a pagar",
    }),
    check({
      key: "totals_consistent",
      label: "Bedragen tellen op",
      severity: "blocking",
      ...totalsConsistency(f),
      es: "el desglose no cuadra: la base imponible más el IVA no suma el total indicado",
    }),
    check({
      key: "is_final_invoice",
      label: "Het is een echte factuur",
      severity: "blocking",
      ok: !notAnInvoice,
      found: f.documentKind,
      es: "el documento recibido es un presupuesto o albarán, no una factura",
    }),
    check({
      key: "work_description",
      label: "Omschrijving van het geleverde werk",
      severity: "blocking",
      ok: isMeaningfulDescription(f.descriptionText),
      found: f.descriptionText?.slice(0, 80),
      es: "una descripción detallada de los trabajos realizados o del material suministrado — no es suficiente indicar «trabajos» o «varios»",
    }),
    check({
      key: "hours_detail",
      label: "Aantal uren en periode",
      severity: "blocking",
      // Alleen relevant bij een arbeidsfactuur.
      skipped: f.isLabor !== true,
      ok: f.isLabor !== true || (f.hours != null && f.hours > 0 && (!!f.hoursPeriodFrom || hasDateRange(f.descriptionText))),
      found: f.hours != null ? `${f.hours} uur ${f.hoursPeriodFrom ?? ""}${f.hoursPeriodTo ? `..${f.hoursPeriodTo}` : ""}`.trim() : null,
      es: "el número de horas trabajadas y el periodo (fechas) al que corresponden",
    }),
    check({
      key: "project_reference",
      label: "Herkenbare werf-/projectreferentie",
      severity: "warning",
      ok: ctx.projectMatched,
      found: f.projectHint,
      es: "la referencia de la obra o proyecto (p. ej. «Silvestre», «Cap Negre»)",
    }),
    check({
      key: "payment_iban",
      label: "Betaalgegevens (IBAN)",
      severity: "warning",
      skipped: noIbanNeeded,
      ok: noIbanNeeded || !!iban,
      found: iban ?? f.paymentMethod,
      es: "el IBAN completo para realizar la transferencia",
    }),
    check({
      key: "iban_checksum",
      label: "IBAN-controlegetal klopt",
      severity: "warning",
      skipped: !iban,
      ok: !iban || isValidIban(iban),
      found: iban,
      internal: true,
      es: "",
    }),
    check({
      key: "iban_changed",
      // Het klassieke factuurfraude-patroon: bekende leverancier, nieuw
      // rekeningnummer. Nooit blokkerend, wel opvallend tonen.
      label: "IBAN wijkt af van eerdere facturen van deze leverancier",
      severity: "warning",
      skipped: !iban || !ctx.knownIbans?.length,
      ok: !iban || !ctx.knownIbans?.length || ctx.knownIbans.includes(iban),
      found: iban,
      internal: true,
      es: "",
    }),
    check({
      key: "simplified_invoice",
      label: "Factura simplificada (ticket) — vraag een volledige factuur",
      severity: "warning",
      skipped: !isSimplified,
      ok: !isSimplified,
      found: f.documentKind,
      es: "una factura completa con nuestros datos fiscales — una factura simplificada no nos permite deducir el IVA",
    }),
    check({
      key: "duplicate",
      label: "Mogelijk dubbel — deze factuur bestaat al",
      severity: "warning",
      skipped: !ctx.duplicateOf,
      ok: !ctx.duplicateOf,
      found: ctx.duplicateOf ?? null,
      internal: true,
      es: "",
    }),
  ];

  const failed = checks.filter((c) => !c.ok && !c.skipped);
  const blocking = failed.filter((c) => c.severity === "blocking");
  return {
    status: blocking.length > 0 ? "reject" : failed.length > 0 ? "warn" : "ok",
    checks,
    mailable: failed.filter((c) => !c.internal && c.es),
    readOk: true,
    readError: null,
  };
}

/** Base + btw − inhouding moet het totaal geven (tolerantie 2 cent). */
function totalsConsistency(f: AiInvoiceFields): { ok: boolean; skipped?: boolean; found?: string | null } {
  if (f.subtotal == null || f.total == null) return { ok: true, skipped: true };
  const vat = f.vatAmount ?? (f.vatExemptionNote ? 0 : null);
  if (vat == null) return { ok: true, skipped: true };
  const berekend = f.subtotal + vat - (f.retentionAmount ?? 0);
  const verschil = Math.abs(berekend - f.total);
  return {
    ok: verschil <= 0.02,
    found: verschil > 0.02 ? `berekend ${berekend.toFixed(2)} vs. ${f.total.toFixed(2)} op de factuur` : null,
  };
}

function isMeaningfulDescription(text: string | null): boolean {
  const t = norm(text);
  if (t.length < 15) return false;
  return !VAGUE.test(t);
}

/** Staat er een datumreeks in de omschrijving (bv. "18/07 al 24/07")? */
function hasDateRange(text: string | null): boolean {
  return /\d{1,2}[-/]\d{1,2}.{0,12}\d{1,2}[-/]\d{1,2}/.test(text ?? "");
}
