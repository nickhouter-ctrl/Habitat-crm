import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Leren van het keurgedrag bij inkoopfacturen.
 *
 * Elke beslissing staat al in `purchase_invoice_reviews` (status approved /
 * ignored / rejected, met wie en wanneer). Daar hoeft niets bij: we lezen die
 * historie terug en leiden er per signaal een gewicht uit af. Zo wordt de
 * wachtrij schoner naarmate er meer beslissingen liggen — zonder dat iemand
 * regels hoeft te onderhouden.
 *
 * Signalen (bewust grof, zodat ze snel genoeg voorbeelden hebben):
 *   afzender      het volledige e-mailadres
 *   domein        het deel na de @ (leveranciers mailen vaak vanaf meerdere adressen)
 *   bestand       de bestandsnaam met cijfers vervangen door #, dus
 *                 "factuur 2026-118.pdf" → "factuur #-#.pdf"
 *   soort         het bestandstype (pdf, xlsx, png …)
 *   grootte       klein / middel / groot — een logo van 27 kB is geen factuur
 *   verdict       wat de automatische controle ervan vond
 *
 * Rekenwijze: per signaal de kans dat zo'n item werd weggezet, met
 * Laplace-smoothing (+1) zodat één voorbeeld nooit meteen de doorslag geeft.
 * De gewichten worden bij elkaar opgeteld als log-odds (naive Bayes). Dat is
 * uitlegbaar: we kunnen per item precies laten zien welk signaal meewoog.
 *
 * Wat het NOOIT doet: automatisch goedkeuren. Een factuur die ten onrechte
 * wordt overgeslagen kost niets (hij blijft staan en is met één klik terug),
 * een factuur die ten onrechte wordt goedgekeurd gaat naar de boekhouding.
 */

/** Ruwe kenmerken van een item dat in de wachtrij zou komen. */
export interface ReviewKandidaat {
  fromEmail?: string | null;
  filename?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  verdict?: string | null;
  /** Heeft de AI een bedrag kunnen vinden? Zonder bedrag is het zelden een factuur. */
  heeftBedrag?: boolean;
}

export interface Beoordeling {
  /** Kans (0–1) dat dit item niet in de keurlijst hoort. */
  kansGeenFactuur: number;
  /** True = eenduidig patroon, mag buiten de wachtrij (blijft terugzetbaar). */
  slaOver: boolean;
  /** True = twijfel: wel in de lijst, maar onderaan met een waarschuwing. */
  twijfel: boolean;
  /** Uitleg in gewone taal, sterkste signaal eerst. */
  redenen: string[];
}

/**
 * Drempels. Overslaan gebeurt NIET op een kansdrempel: een terugkerende
 * leverancier die soms dubbel stuurt haalt die drempel ook, en dan verdwijnt
 * een echte factuur uit het zicht. Er wordt alleen overgeslagen bij een
 * EENDUIDIG patroon: precies dit soort bestand van deze afzender is al
 * meerdere keren weggezet en nog nooit goedgekeurd.
 */
const MIN_EENDUIDIG = 3;
/** Vanaf deze kans komt het onderaan de lijst met een waarschuwing. */
const DREMPEL_TWIJFEL = 0.6;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** "Factuur 2026-118 (2).pdf" → "factuur #-# (#).pdf" — herkent terugkerende soorten bestanden. */
export function bestandPatroon(filename: string | null | undefined): string {
  return norm(filename)
    .replace(/[0-9]+/g, "#")
    .replace(/\s+/g, " ")
    .replace(/#(\s*[-_.]\s*#)+/g, "#-#");
}

function grootteKlasse(bytes: number | null | undefined): string {
  const kb = (bytes ?? 0) / 1024;
  if (!kb) return "onbekend";
  if (kb < 60) return "klein";
  if (kb < 250) return "middel";
  return "groot";
}

function soort(contentType: string | null | undefined): string {
  const t = norm(contentType);
  if (t.includes("pdf")) return "pdf";
  if (t.includes("spreadsheet") || t.includes("excel") || t.includes("ms-excel")) return "sheet";
  if (t.startsWith("image/")) return "afbeelding";
  if (t.includes("word")) return "word";
  if (t.includes("xml")) return "xml";
  return t || "onbekend";
}

/** De signalen van één kandidaat, met een label voor de uitleg. */
function signalen(k: ReviewKandidaat): { sleutel: string; waarde: string; uitleg: string }[] {
  const mail = norm(k.fromEmail);
  const domein = mail.includes("@") ? mail.split("@")[1] : "";
  const uit: { sleutel: string; waarde: string; uitleg: string }[] = [];
  if (mail) uit.push({ sleutel: "afzender", waarde: mail, uitleg: `mail van ${mail}` });
  if (domein) uit.push({ sleutel: "domein", waarde: domein, uitleg: `afzender @${domein}` });
  const pat = bestandPatroon(k.filename);
  if (pat) uit.push({ sleutel: "bestand", waarde: pat, uitleg: `bestanden zoals "${k.filename}"` });
  // De combinatie is het scherpste signaal: dit soort bestand van déze afzender.
  if (pat && mail) uit.push({ sleutel: "afzender+bestand", waarde: `${mail}|${pat}`, uitleg: `"${k.filename}" van ${mail}` });
  uit.push({ sleutel: "soort", waarde: soort(k.contentType), uitleg: `${soort(k.contentType)}-bijlage` });
  uit.push({ sleutel: "grootte", waarde: grootteKlasse(k.sizeBytes), uitleg: `${grootteKlasse(k.sizeBytes)} bestand` });
  if (k.verdict) uit.push({ sleutel: "verdict", waarde: norm(k.verdict), uitleg: `controle zei "${k.verdict}"` });
  return uit;
}

type Tabel = Map<string, { goed: number; weg: number }>;
let cache: { tabel: Tabel; totaalGoed: number; totaalWeg: number; tijd: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/**
 * Historie ophalen en per signaalwaarde tellen hoe vaak zoiets werd
 * goedgekeurd en hoe vaak weggezet. `superseded` (door een nieuwe versie
 * vervangen) telt niet mee: dat is geen oordeel over het bestand zelf.
 */
async function leer(): Promise<{ tabel: Tabel; totaalGoed: number; totaalWeg: number }> {
  if (cache && Date.now() - cache.tijd < CACHE_MS) return cache;
  const rijen = (await db.execute(sql`
    select r.status, r.verdict, e.from_email, a.filename, a.content_type, a.size_bytes
    from purchase_invoice_reviews r
    left join email_inbox e on e.id = r.email_id
    left join mail_attachments a on a.id = r.mail_attachment_id
    where r.status in ('approved', 'ignored', 'rejected')
  `)) as unknown as Array<{
    status: string;
    verdict: string | null;
    from_email: string | null;
    filename: string | null;
    content_type: string | null;
    size_bytes: number | null;
  }>;

  const tabel: Tabel = new Map();
  let totaalGoed = 0;
  let totaalWeg = 0;
  for (const r of rijen) {
    const weg = r.status !== "approved";
    if (weg) totaalWeg++;
    else totaalGoed++;
    for (const s of signalen({ fromEmail: r.from_email, filename: r.filename, contentType: r.content_type, sizeBytes: r.size_bytes, verdict: r.verdict })) {
      const key = `${s.sleutel}=${s.waarde}`;
      const t = tabel.get(key) ?? { goed: 0, weg: 0 };
      if (weg) t.weg++;
      else t.goed++;
      tabel.set(key, t);
    }
  }
  cache = { tabel, totaalGoed, totaalWeg, tijd: Date.now() };
  return cache;
}

/** Cache leegmaken — na een nieuwe beslissing telt die meteen mee. */
export function vergeetCache(): void {
  cache = null;
}

/**
 * Beoordeel één kandidaat. Geen historie (nieuwe installatie) → niets
 * overslaan; alleen de vaste startregel over kleine afbeeldingen blijft.
 */
export async function beoordeelKandidaat(k: ReviewKandidaat): Promise<Beoordeling> {
  const { tabel, totaalGoed, totaalWeg } = await leer();
  const redenen: string[] = [];

  // Startregel, ook zonder historie: een kleine afbeelding zonder bedrag is een
  // logo of schermfoto uit de mail, geen factuur.
  const kleinPlaatje = soort(k.contentType) === "afbeelding" && (k.sizeBytes ?? 0) < 60 * 1024 && !k.heeftBedrag;

  const basis = Math.log((totaalWeg + 1) / (totaalGoed + 1));
  let score = basis;
  const bijdragen: { uitleg: string; gewicht: number; n: number }[] = [];
  for (const s of signalen(k)) {
    const t = tabel.get(`${s.sleutel}=${s.waarde}`);
    if (!t) continue;
    const n = t.goed + t.weg;
    // P(signaal | weggezet) tegen P(signaal | goedgekeurd), met smoothing.
    const gewicht = Math.log(((t.weg + 1) / (totaalWeg + 2)) / ((t.goed + 1) / (totaalGoed + 2)));
    score += gewicht;
    bijdragen.push({ uitleg: s.uitleg, gewicht, n });
  }
  const kans = 1 / (1 + Math.exp(-score));

  for (const b of bijdragen.filter((x) => x.gewicht > 0.4 && x.n >= 2).sort((a, b2) => b2.gewicht - a.gewicht).slice(0, 3)) {
    redenen.push(`${b.uitleg} werd ${b.n}× weggezet`);
  }
  if (kleinPlaatje) redenen.unshift("kleine afbeelding uit de mail, geen bedrag gevonden");

  // Eenduidig: een signaal dat ≥ MIN_EENDUIDIG keer is weggezet en nog nooit
  // goedgekeurd. Alleen de scherpe signalen tellen mee (niet "pdf" of "groot").
  let eenduidig: { uitleg: string; n: number } | null = null;
  for (const s of signalen(k)) {
    if (!["afzender+bestand", "bestand", "afzender"].includes(s.sleutel)) continue;
    const t = tabel.get(`${s.sleutel}=${s.waarde}`);
    if (t && t.goed === 0 && t.weg >= MIN_EENDUIDIG) {
      if (!eenduidig || t.weg > eenduidig.n) eenduidig = { uitleg: s.uitleg, n: t.weg };
    }
  }
  if (eenduidig) redenen.unshift(`${eenduidig.uitleg}: ${eenduidig.n}× weggezet, nooit goedgekeurd`);

  const slaOver = kleinPlaatje || !!eenduidig;
  return { kansGeenFactuur: Math.round(kans * 100) / 100, slaOver, twijfel: !slaOver && kans >= DREMPEL_TWIJFEL, redenen };
}
