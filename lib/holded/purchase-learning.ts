/**
 * Leren van hoe inkoopfacturen nu in Holded geboekt worden. Die handmatige
 * boekingen zijn de waarheid (Nick, 09-11-2026): per leverancier en per soort
 * regel (uren, materiaal, transport) kiezen we de rekening en btw die daar het
 * vaakst voor gebruikt is.
 *
 * Getoetst op 519 regels uit 2026, steeds alleen met de facturen van vóór die
 * factuur: 82% van de rekeningen goed. De missers zitten vooral in de historie
 * zelf (uren of materiaal moet daar geraden worden); in het CRM is de soort
 * bekend uit het keuren.
 */
import { TRANSPORT_RE, effectiveRate, type BookingKind } from "./purchase-booking";

export type HistoryLine = {
  contact: string | null;
  date: number;
  name?: string;
  desc?: string;
  units?: number;
  price?: number;
  account?: string;
  taxes?: string[];
};

type TaxLike = { key: string; name: string; amount: string | null; group: string };

/** Soort van een regel zoals hij al in Holded staat (daar moet het geraden worden). */
export function historyLineKind(l: Pick<HistoryLine, "name" | "desc" | "units" | "price">): BookingKind {
  if (TRANSPORT_RE.test(`${l.name ?? ""} ${l.desc ?? ""}`)) return "transport";
  const u = l.units ?? 0, p = l.price ?? 0;
  // Uren: meerdere eenheden tegen een rond uurtarief (Wilhelmus 36 × 27, Pieter 8 × 30).
  if (u !== 1 && p >= 10 && p <= 60 && Math.abs(p - Math.round(p)) < 1e-6) return "labor";
  return "material";
}

/** Meest gebruikte waarde; bij gelijkspel de meest recente. */
function mostUsed<T>(items: { value: T; date: number }[]): T | null {
  const m = new Map<T, { n: number; last: number }>();
  for (const it of items) {
    const s = m.get(it.value) ?? { n: 0, last: 0 };
    s.n++;
    s.last = Math.max(s.last, it.date);
    m.set(it.value, s);
  }
  let best: T | null = null, bn = -1, bl = -1;
  for (const [v, s] of m) if (s.n > bn || (s.n === bn && s.last > bl)) { best = v; bn = s.n; bl = s.last; }
  return best;
}

export type Suggestion = {
  account: string | null;
  vat: string;
  retention: string | null;
  /** Waar het voorstel op rust — getoond bij de regel. */
  basis: string;
};

export function suggestBooking(args: {
  history: HistoryLine[];
  contactId: string | null;
  kind: BookingKind;
  /** Btw-tarief van de factuur (uitgelezen); null = onbekend. */
  vatRate: number | null;
  /** Factuur noemt verlegde btw / vrijstelling. */
  vatExempt: boolean;
  /** IRPF-percentage van de factuur; null/0 = geen inhouding. */
  retentionPct: number | null;
  taxes: TaxLike[];
}): Suggestion {
  const { history, contactId, kind } = args;
  const own = contactId ? history.filter((l) => l.contact === contactId) : [];
  const ownKind = own.filter((l) => historyLineKind(l) === kind);
  const allKind = history.filter((l) => historyLineKind(l) === kind);

  const kindLabel = { labor: "uren", material: "materiaal", transport: "transport" }[kind];
  let account: string | null = null, basis = "geen eerdere boeking";
  const pools: [HistoryLine[], string][] = [
    [ownKind, `zoals eerder bij deze leverancier (${kindLabel}, ${ownKind.length}×)`],
    [own, `zoals eerder bij deze leverancier (${own.length}×, andere soort)`],
    [allKind, `meest gebruikt voor ${kindLabel} bij alle leveranciers`],
  ];
  for (const [pool, label] of pools) {
    const v = mostUsed(pool.filter((l) => l.account).map((l) => ({ value: l.account!, date: l.date })));
    if (v) { account = v; basis = label; break; }
  }

  const tax = new Map(args.taxes.map((t) => [t.key, t]));
  const ownTaxes = (ownKind.length ? ownKind : own).flatMap((l) => (l.taxes ?? []).map((k) => ({ value: k, date: l.date })));

  // Btw volgt de factuur; de historie kiest alleen tussen sleutels met hetzelfde
  // effectieve tarief (bv. ISP i.p.v. 0%, of "bien de inversión" i.p.v. gewoon 21%).
  const rate = args.vatExempt ? 0 : args.vatRate;
  const ivaKeys = ownTaxes.filter((t) => tax.get(t.value)?.group === "iva");
  const sameRate = rate == null ? ivaKeys : ivaKeys.filter((t) => effectiveRate(tax.get(t.value)) === rate);
  let vat = mostUsed(sameRate);
  if (!vat) {
    const fallback = `p_iva_${String(rate ?? 21).replace(".", "")}`;
    vat = tax.has(fallback) ? fallback : "p_iva_21";
  }

  let retention: string | null = null;
  if (args.retentionPct && args.retentionPct > 0) {
    const retKeys = ownTaxes.filter((t) => tax.get(t.value)?.group === "retention" && Math.abs(effectiveRate(tax.get(t.value))) === args.retentionPct);
    retention = mostUsed(retKeys) ?? (tax.has(`p_ret_${args.retentionPct}`) ? `p_ret_${args.retentionPct}` : null);
  }

  return { account, vat, retention, basis };
}
