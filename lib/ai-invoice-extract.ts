/**
 * AI-uitlezing van een factuur-bijlage (PDF, foto of Excel) met de Anthropic-API.
 *
 * Twee ingangen, met opzet:
 * - `readInvoiceFromBuffer` / `readInvoiceWithAI` geven een envelope terug die
 *   zegt of de UITLEZING lukte. Dat onderscheid is essentieel voor de
 *   goedkeuringspoort: een veld op null binnen een geslaagde uitlezing betekent
 *   "staat niet op de factuur" (en kan tot een verzoek aan de leverancier
 *   leiden), terwijl een mislukte uitlezing — geen sleutel, rate limit, kapotte
 *   scan — nooit een verwijt aan de leverancier mag opleveren.
 * - `extractInvoiceFields*` geven velden of null, voor aanroepers die alleen
 *   het bedrag/subtotaal willen weten.
 *
 * Vereist `ANTHROPIC_API_KEY`. Kosten: ~2-4 cent per factuur.
 */
import * as XLSX from "xlsx";

import { downloadMailAttachmentBuffer } from "@/lib/storage";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export type AiInvoiceFields = {
  /** De partij die de factuur HEEFT UITGESCHREVEN (de verkoper/leverancier),
   *  NIET de ontvanger (Habitat / Creadores). */
  supplier: string | null;
  /** Eindtotaal incl. BTW in de valuta van de factuur. */
  total: number | null;
  /** Subtotaal / base imponible (EX. BTW) in de valuta van de factuur. */
  subtotal: number | null;
  currency: string | null;
  invoiceNumber: string | null;
  /** YYYY-MM-DD */
  invoiceDate: string | null;
  /** true = arbeid/uren (bv. bouwer), false = materialen/producten, null = onbekend. */
  isLabor: boolean | null;
  /** Aantal gewerkte uren als het een arbeidsfactuur is. */
  hours: number | null;
  /** Projectnaam/-referentie die op de factuur staat (bv. "Finca Lisa" / "Cap Negre"). */
  projectHint: string | null;

  /* ---- Uitgever (nodig voor de wettelijke controle) ---- */
  /** Volledige juridische naam van de leverancier. */
  supplierLegalName: string | null;
  /** NIF/CIF/btw-nummer LETTERLIJK zoals afgedrukt (niet opschonen). */
  supplierTaxId: string | null;
  /** Volledig adres van de leverancier, als één string. */
  supplierAddress: string | null;
  /** E-mailadres in het briefhoofd — de juiste partij bij een doorgestuurde factuur. */
  supplierEmail: string | null;
  supplierCountry: string | null;

  /* ---- Ontvanger: staan ONZE gegevens erop? ---- */
  recipientName: string | null;
  recipientTaxId: string | null;

  /* ---- Btw ---- */
  vatRate: number | null;
  vatAmount: number | null;
  /** Letterlijke vrijstellingslegenda ("inversión del sujeto pasivo", "exento
   *  art. 20 LIVA", "recargo de equivalencia"). Vervangt het IVA-tarief — zónder
   *  dit veld zouden we elke btw-verlegde bouwfactuur afkeuren. */
  vatExemptionNote: string | null;
  /** IRPF-inhouding: bij Spaanse autónomos standaard, verklaart waarom
   *  totaal ≠ base + IVA. */
  retentionPct: number | null;
  retentionAmount: number | null;

  /* ---- Betaling ---- */
  /** Genormaliseerd (spaties eruit, hoofdletters). */
  iban: string | null;
  /** Letterlijk: transferencia / efectivo / domiciliación / tarjeta. */
  paymentMethod: string | null;

  /* ---- Omschrijving: waarvoor is dit? ---- */
  /** De omschrijvingsregels letterlijk aaneengeplakt (max 600 tekens). Voedt
   *  zowel de controle "is dit meer dan alleen 'werkzaamheden'" als de
   *  projectherkenning. */
  descriptionText: string | null;
  /** Periode waarop de uren betrekking hebben (YYYY-MM-DD). */
  hoursPeriodFrom: string | null;
  hoursPeriodTo: string | null;

  /* ---- Aard van het document ---- */
  /** factura | simplificada | proforma | presupuesto | albaran | recibo | other */
  documentKind: string | null;
  /** ISO2 van de taal van het document — bepaalt de taal van de afkeurmail. */
  language: string | null;

  /* ---- Verdeling over projecten ---- */
  /** Onderaannemers sturen weekfacturen: in één week kan er op meerdere werven
   *  gewerkt zijn. Elke regel met een eigen werf/project komt hier apart terug,
   *  zodat de kosten bij goedkeuring op het juiste project belanden in plaats
   *  van allemaal op één. Eén werf op de factuur → één regel. */
  lines: AiInvoiceLine[];

  /* ---- Leeskwaliteit: "staat er niet" vs "ik kon het niet lezen" ---- */
  legible: boolean | null;
  readNotes: string | null;
};

/** Eén werf-/projectregel op een factuur. */
export type AiInvoiceLine = {
  /** De werf-/projectaanduiding zoals die bij deze regel staat. */
  projectHint: string | null;
  description: string | null;
  hours: number | null;
  /** Uurtarief bij een urenregel. */
  rate: number | null;
  /** Bedrag van deze regel, EX. btw. */
  amount: number | null;
  periodFrom: string | null;
  periodTo: string | null;
};

/** Waarom een uitlezing technisch mislukte — géén oordeel over de factuur. */
export type AiReadError =
  | "no-api-key"
  | "unsupported-type"
  | "image-too-large"
  | "excel-parse-failed"
  | "http-429"
  | "http-5xx"
  | "http-4xx"
  | "timeout"
  | "network-error"
  | "empty-response"
  | "parse-error";

/**
 * Het resultaat van een uitlezing. Cruciaal onderscheid: `ok: false` betekent
 * dat de UITLEZING faalde (geen sleutel, rate limit, kapot bestand) — dan mag er
 * nooit een factuur op afgekeurd worden. Een veld op `null` binnen `ok: true`
 * betekent wél "dit staat niet op de factuur".
 */
export type AiInvoiceRead =
  | { ok: true; fields: AiInvoiceFields; model: string; promptVersion: number; readAt: string }
  | { ok: false; error: AiReadError; detail?: string };

/** Bump dit bij elke prompt-wijziging: het wordt per factuur meegeschreven, zodat
 *  je later weet welke facturen met welke versie zijn gelezen. */
export const PROMPT_VERSION = 3;

const PROMPT = `Je leest één inkoopfactuur (van een leverancier aan ons bedrijf).

BELANGRIJK over de leverancier:
- De ONTVANGER/klant is altijd ons: "Habitat One", "Habitat one & one SL" of
  "Creadores Sorprendentes" (dat zijn wíj; Creadores stuurt facturen alleen door).
  Geef die NOOIT terug als supplier.
- De "supplier" is de partij die de factuur heeft UITGESCHREVEN (de verkoper /
  dienstverlener / het bedrijf bovenaan met zijn eigen NIF/CIF, dat geld van ons
  ontvangt). Gebruik de duidelijke handelsnaam, kort.

Geef ALLEEN een JSON-object terug — geen markdown, geen uitleg — met exact deze keys:
- "supplier": string | null — naam van de leverancier/verkoper (niet de klant)
- "total": number | null — het EINDTOTAAL inclusief BTW dat betaald moet worden
- "subtotal": number | null — het SUBTOTAAL / base imponible EXCLUSIEF BTW (dus zonder IVA/BTW). Bij btw-verlegd (inversión del sujeto pasivo) is dit gelijk aan het totaal.
- "currency": string | null — 3-letter ISO-code ("EUR", "USD", …)
- "invoiceNumber": string | null — het factuurnummer
- "invoiceDate": string | null — factuurdatum als YYYY-MM-DD
- "isLabor": boolean | null — true als dit ARBEID/UREN is (bv. een bouwer/onderaannemer die gewerkte uren factureert, "horas", "mano de obra", "jornales"); false als het MATERIALEN/producten/goederen zijn; null bij twijfel
- "hours": number | null — het totaal aantal gewerkte uren als het arbeid is (anders null)
- "projectHint": string | null — de projectnaam of werf-/adresreferentie die op de factuur staat (bv. "Finca Lisa", "Cap Negre", een straat/adres of projectcode). null als er niets staat.
- "supplierLegalName": string | null — de VOLLEDIGE juridische naam van de leverancier (met S.L. / S.A. / autónomo-naam)
- "supplierTaxId": string | null — NIF/CIF/btw-nummer van de leverancier, LETTERLIJK zoals afgedrukt
- "supplierAddress": string | null — het volledige adres van de leverancier als één string
- "supplierEmail": string | null — e-mailadres van de leverancier zoals dat op de factuur staat
- "supplierCountry": string | null — 2-letter landcode van de leverancier
- "recipientName": string | null — de naam van de ONTVANGER (dat zijn wij: Habitat One / Creadores). Hier vul je ons dus JUIST WEL in.
- "recipientTaxId": string | null — het NIF/CIF van de ontvanger (ons) zoals op de factuur
- "vatRate": number | null — het IVA/btw-PERCENTAGE (bv. 21 of 10)
- "vatAmount": number | null — het IVA/btw-BEDRAG in geld
- "vatExemptionNote": string | null — LETTERLIJK de vrijstellings-/verleggingslegenda als die er staat: "inversión del sujeto pasivo", "operación exenta", "art. 84.Uno.2º", "recargo de equivalencia", "reverse charge". null als er gewoon btw berekend is.
- "retentionPct": number | null — percentage IRPF-inhouding (retención) als dat op de factuur staat
- "retentionAmount": number | null — het ingehouden IRPF-bedrag
- "iban": string | null — het IBAN/rekeningnummer waarop betaald moet worden
- "paymentMethod": string | null — LETTERLIJK de betaalwijze ("transferencia", "efectivo", "domiciliación", "tarjeta")
- "descriptionText": string | null — de omschrijvingsregels LETTERLIJK aaneengeplakt, max 600 tekens. Kopiëren, niet samenvatten en niets verzinnen.
- "hoursPeriodFrom" / "hoursPeriodTo": string | null — begin- en einddatum (YYYY-MM-DD) van de periode waarop gewerkte uren betrekking hebben
- "documentKind": string | null — een van: "factura", "simplificada" (ticket/bon zonder klantgegevens), "proforma", "presupuesto" (offerte), "albaran" (pakbon), "recibo", "other"
- "language": string | null — 2-letter taalcode van het document ("es", "nl", "en")
- "lines": array — de verdeling over werven/projecten. Onderaannemers sturen WEEKFACTUREN en kunnen in één week op meerdere werven gewerkt hebben. Geef per werf/project één object: {"projectHint": string|null, "description": string|null, "hours": number|null, "rate": number|null, "amount": number|null, "periodFrom": string|null, "periodTo": string|null}. "amount" is het bedrag van die regel EX. btw. Staat er maar één werf op de factuur, geef dan precies één object. Kun je de bedragen per werf niet los zien, geef dan wel de regels met hun uren maar laat "amount" null.
- "legible": boolean — true als je het document goed kon lezen; false bij een onscherpe/afgesneden/gedraaide scan
- "readNotes": string | null — korte notitie als er iets mis was met de leesbaarheid

ZEER BELANGRIJK — het verschil tussen "ontbreekt" en "onleesbaar":
- null betekent: ik heb het HELE document bekeken en dit gegeven staat er niet op.
- Kun je iets niet LEZEN (onscherpe foto, afgesneden tekst, gedraaide scan), zet dan
  "legible" op false en beschrijf het in "readNotes". Vul in dat geval velden NIET met
  null alsof ze zouden ontbreken — wij sturen op basis van ontbrekende velden een
  verzoek aan de leverancier, en dat mag nooit gebeuren omdat de scan slecht was.
- Geef "supplierTaxId", "iban" en "invoiceNumber" LETTERLIJK terug zoals afgedrukt.
  Niet opschonen, niet corrigeren, geen spaties weghalen.
- Let op de legenda "inversión del sujeto pasivo" / "exento": die VERVANGT het
  btw-tarief. Vul dan vatExemptionNote en laat vatRate/vatAmount leeg.

Getallen zijn pure JSON-nummers (geen valutateken, geen duizendtal-scheiding).
Als iets onbekend is: null.`;

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

export function aiInvoiceConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Grens per afbeelding: base64 blaast een buffer met ~4/3 op en de API weigert
 *  boven 5 MB. Een te grote foto is een technische grens, geen slechte factuur. */
const MAX_IMAGE_BYTES = 3_500_000;

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/** Bouw de message-content: PDF als document, foto als afbeelding, Excel als tekst. */
function buildContent(
  buffer: Buffer,
  filename: string,
  contentType: string,
): { content: unknown[] } | { error: AiReadError } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = contentType === "application/pdf" || ext === "pdf";
  const isExcel =
    contentType.includes("spreadsheet") || contentType === "application/vnd.ms-excel" || ext === "xls" || ext === "xlsx";
  const imageType = IMAGE_TYPES[ext] ?? (contentType.startsWith("image/") ? contentType : null);

  if (isPdf) {
    return {
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
        },
        { type: "text", text: PROMPT },
      ],
    };
  }

  // Foto van een bon: die kwamen tot nu toe helemaal niet door de uitlezing heen.
  if (imageType) {
    if (buffer.byteLength > MAX_IMAGE_BYTES) return { error: "image-too-large" };
    return {
      content: [
        { type: "image", source: { type: "base64", media_type: imageType, data: buffer.toString("base64") } },
        { type: "text", text: PROMPT },
      ],
    };
  }

  if (isExcel) {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      // NIET sheet_to_csv: die schrijft élke lege kolom als komma. De
      // Allpack-factuur werd zo 525.000 tekens, waarvan de eerste 60.000 (de
      // limiet) vrijwel alleen komma's — de AI zag de factuur dus nooit en het
      // oordeel werd "onleesbaar". Nu alleen de gevulde cellen.
      const text = wb.SheetNames.map((naam) => {
        const rijen = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[naam], {
          header: 1,
          defval: "",
          raw: false,
          blankrows: false,
        });
        const regels = rijen
          .map((rij) =>
            rij
              .map((cel) => String(cel ?? "").replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .join(" | "),
          )
          .filter(Boolean);
        return `# ${naam}\n${regels.join("\n")}`;
      })
        .join("\n\n")
        .slice(0, 60000);
      return { content: [{ type: "text", text: `${PROMPT}\n\n--- FACTUUR (Excel als tekst) ---\n${text}` }] };
    } catch {
      return { error: "excel-parse-failed" };
    }
  }
  return { error: "unsupported-type" };
}

/**
 * Leest een factuur uit en geeft expliciet terug of dat GELUKT is.
 *
 * Dit onderscheid is de kern: een mislukte uitlezing (geen sleutel, rate limit,
 * onleesbaar bestand) mag nooit tot een afkeuring leiden, terwijl een veld op
 * null binnen een geslaagde uitlezing wél betekent dat het niet op de factuur
 * staat. De oudere `extractInvoiceFields*`-functies gooien dat verschil weg en
 * blijven bestaan voor de plekken die het niet nodig hebben.
 */
export async function readInvoiceFromBuffer(args: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<AiInvoiceRead> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "no-api-key" };

  const built = buildContent(args.buffer, args.filename, args.contentType);
  if ("error" in built) return { ok: false, error: built.error };

  // Eén retry bij rate limit / serverfout / netwerkfout: zonder deze retry
  // wordt een hikje stil een "onleesbare factuur" en gaat 'ie handmatig de
  // wachtrij in. Wat er als laatste misging bepaalt het foutlabel — vroeger
  // heette elke gegooide fetch-fout "http-5xx" en elke uitgeputte 5xx
  // "http-429", waardoor de melding op de kaart niets zei over de oorzaak.
  let lastError: AiReadError = "http-429";
  let lastDetail: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          // Ruim: het JSON-object is met de compliance-velden fors groter dan
          // voorheen; te krap betekent afgekapte JSON en dus een parse-fout.
          max_tokens: 3000,
          temperature: 0,
          messages: [{ role: "user", content: built.content }],
        }),
        cache: "no-store",
        // De mailpoll heeft een hard tijdsbudget; zonder deze grens kan één
        // trage factuur de hele ronde laten aflopen.
        signal: AbortSignal.timeout(45_000),
      });

      if (res.status === 429) {
        lastError = "http-429";
        lastDetail = undefined;
        continue;
      }
      if (res.status >= 500) {
        lastError = "http-5xx";
        lastDetail = `API gaf ${res.status}`;
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn("AI-invoice extract faalde:", res.status, detail);
        return { ok: false, error: "http-4xx", detail: detail.slice(0, 300) };
      }

      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n");
      if (!text) return { ok: false, error: "empty-response" };

      try {
        const raw = JSON.parse(stripFences(text)) as Record<string, unknown>;
        return {
          ok: true,
          fields: mapFields(raw),
          model: MODEL,
          promptVersion: PROMPT_VERSION,
          readAt: new Date().toISOString(),
        };
      } catch {
        return { ok: false, error: "parse-error", detail: text.slice(0, 300) };
      }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      console.warn("AI-invoice extract error:", err);
      lastError = timedOut ? "timeout" : "network-error";
      // fetch verstopt de echte oorzaak (DNS, TLS, reset) vaak in `cause`.
      const cause = err instanceof Error && err.cause ? ` — ${String(err.cause)}` : "";
      lastDetail = `${String(err)}${cause}`.slice(0, 300);
      continue;
    }
  }
  return { ok: false, error: lastError, detail: lastDetail };
}

/** Zelfde uitlezing op een bestand in de mail-bucket. */
export async function readInvoiceWithAI(args: {
  storagePath: string;
  filename: string;
  contentType: string;
}): Promise<AiInvoiceRead> {
  const buffer = await downloadMailAttachmentBuffer(args.storagePath);
  if (!buffer) return { ok: false, error: "unsupported-type", detail: "bijlage niet te downloaden" };
  return readInvoiceFromBuffer({ ...args, buffer });
}

/**
 * Oudere, simpelere ingang: velden of null. Behoudt het gedrag van vóór de
 * goedkeuringspoort voor aanroepers die alleen het subtotaal willen weten en
 * geen onderscheid nodig hebben tussen "mislukt" en "staat er niet".
 */
export async function extractInvoiceFieldsWithAI(args: {
  storagePath: string;
  filename: string;
  contentType: string;
}): Promise<AiInvoiceFields | null> {
  const r = await readInvoiceWithAI(args);
  return r.ok ? r.fields : null;
}

/** Zelfde uitlezing, maar op een al ingeladen bestand (bv. een bijlage uit de
 *  inkooporder-bucket i.p.v. de mail-bucket). */
export async function extractInvoiceFieldsFromBuffer(args: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<AiInvoiceFields | null> {
  const r = await readInvoiceFromBuffer(args);
  return r.ok ? r.fields : null;
}

/** JSON van het model → getypeerde velden. Doet géén oordeel, alleen opschonen. */
function mapFields(raw: Record<string, unknown>): AiInvoiceFields {
  const supplier = str(raw.supplier);
  // Veiligheid: onszelf mag nooit als leverancier terugkomen (Creadores stuurt
  // facturen door, dus onze eigen naam staat vaak op het document).
  const isUs = (v: string | null) => !!v && /habitat\s*one|creadores|sorprendentes/i.test(v);
  return {
    supplier: isUs(supplier) ? null : supplier,
    total: num(raw.total),
    subtotal: num(raw.subtotal),
    currency: str(raw.currency)?.toUpperCase().slice(0, 3) ?? null,
    invoiceNumber: str(raw.invoiceNumber),
    invoiceDate: isoDate(raw.invoiceDate),
    isLabor: typeof raw.isLabor === "boolean" ? raw.isLabor : null,
    hours: num(raw.hours),
    projectHint: str(raw.projectHint),

    supplierLegalName: isUs(str(raw.supplierLegalName)) ? null : str(raw.supplierLegalName),
    supplierTaxId: str(raw.supplierTaxId),
    supplierAddress: str(raw.supplierAddress),
    supplierEmail: str(raw.supplierEmail)?.toLowerCase() ?? null,
    supplierCountry: str(raw.supplierCountry)?.toUpperCase().slice(0, 2) ?? null,

    recipientName: str(raw.recipientName),
    recipientTaxId: str(raw.recipientTaxId),

    vatRate: num(raw.vatRate),
    vatAmount: num(raw.vatAmount),
    vatExemptionNote: str(raw.vatExemptionNote),
    retentionPct: num(raw.retentionPct),
    retentionAmount: num(raw.retentionAmount),

    iban: str(raw.iban)?.replace(/\s/g, "").toUpperCase() ?? null,
    paymentMethod: str(raw.paymentMethod),

    descriptionText: str(raw.descriptionText)?.slice(0, 600) ?? null,
    hoursPeriodFrom: isoDate(raw.hoursPeriodFrom),
    hoursPeriodTo: isoDate(raw.hoursPeriodTo),

    documentKind: str(raw.documentKind)?.toLowerCase() ?? null,
    language: str(raw.language)?.toLowerCase().slice(0, 2) ?? null,

    lines: mapLines(raw.lines),

    // Ontbreekt het veld, dan gaan we uit van leesbaar — anders zou elke oudere
    // prompt-versie ineens als onleesbaar gelden.
    legible: typeof raw.legible === "boolean" ? raw.legible : true,
    readNotes: str(raw.readNotes),
  };
}

function mapLines(v: unknown): AiInvoiceLine[] {
  if (!Array.isArray(v)) return [];
  const out: AiInvoiceLine[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    out.push({
      projectHint: str(o.projectHint),
      description: str(o.description)?.slice(0, 300) ?? null,
      hours: num(o.hours),
      rate: num(o.rate),
      amount: num(o.amount),
      periodFrom: isoDate(o.periodFrom),
      periodTo: isoDate(o.periodTo),
    });
  }
  return out;
}

function isoDate(v: unknown): string | null {
  return str(v)?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}
