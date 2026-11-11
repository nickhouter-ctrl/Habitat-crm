/**
 * Een goedgekeurde inkoopfactuur omzetten naar een Holded-aankoop — puur
 * rekenwerk, zonder database of netwerk (zie purchase-push.ts voor dat deel).
 *
 * Het principe: wat bij het keuren is vastgelegd (uren per werf, materiaal per
 * werf, transport naar rato) wordt in Holded precies zo gespecificeerd — één
 * regel per werf/werker/soort, elk met een eigen Holded-project, een
 * grootboekrekening en btw/IRPF. Zo boeken jullie het nu met de hand ook.
 */

export type BookingKind = "labor" | "material" | "transport";

export type HoldedPushLine = {
  /** Stabiel binnen één voorstel — koppelt formuliervelden aan de regel. */
  key: string;
  kind: BookingKind;
  crmProjectId: string | null;
  holdedProjectId: string | null;
  name: string;
  desc: string;
  units: number;
  price: number;
  /** Holded account-id van de grootboekrekening. */
  account: string | null;
  /** Btw-sleutel, bv. `p_iva_21`. */
  vat: string;
  /** IRPF-sleutel, bv. `p_ret_15`, of null. */
  retention: string | null;
};

export type BookingTotals = { subtotal: number; vat: number; retention: number; total: number };

export type HoldedPushSnapshot = {
  contactId: string | null;
  docNumber: string;
  /** YYYY-MM-DD */
  date: string;
  lines: HoldedPushLine[];
  totals: BookingTotals;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Herkent transport/reiskosten/vervoer/afvoer — die gaan in Holded op een eigen rekening. */
export const TRANSPORT_RE = /reis|transport|vervoer|gasolin|combust|desplaz|kilomet|\bkm\b|\brit\b|puin|afval/i;

export type BookingSource = {
  /** Factuur ex btw in EUR — waar de regels samen precies op uit moeten komen. */
  exVat: number;
  poProjectId: string | null;
  countAsLabor: boolean;
  timeEntries: { projectId: string; workerName: string | null; hours: number; rate: number }[];
  costs: { projectId: string; category: string; description: string; amount: number }[];
  projectNames: Map<string, string>;
  /** Omschrijving voor een factuur zonder verdeling (één regel). */
  fallbackDesc: string;
};

export type DraftLine = Omit<HoldedPushLine, "holdedProjectId" | "account" | "vat" | "retention">;

const fmt = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * De regels zoals bij het keuren vastgelegd. Uren per (werf, werker, tarief) —
 * met uren × tarief als het op de cent sluit, anders 1 × bedrag met de uren in
 * de omschrijving (een tarief van € 27,999… is in Holded niet te tonen).
 */
export function buildDraftLines(src: BookingSource): DraftLine[] {
  const naam = (id: string | null) => (id ? src.projectNames.get(id) ?? "Project" : "Algemeen");
  const lines: DraftLine[] = [];

  const uren = new Map<string, { projectId: string; worker: string; hours: number; rate: number; amount: number }>();
  for (const t of src.timeEntries) {
    const worker = t.workerName?.trim() || "Uren";
    const k = `${t.projectId}|${worker}|${t.rate.toFixed(6)}`;
    const g = uren.get(k) ?? { projectId: t.projectId, worker, hours: 0, rate: t.rate, amount: 0 };
    g.hours += t.hours;
    g.amount += t.hours * t.rate;
    uren.set(k, g);
  }
  for (const g of uren.values()) {
    const amount = round2(g.amount);
    const hours = Math.round(g.hours * 100) / 100;
    const rate = round4(g.rate);
    const exact = Math.abs(round2(hours * rate) - amount) < 0.005;
    lines.push({
      key: `u${lines.length}`,
      kind: "labor",
      crmProjectId: g.projectId,
      name: naam(g.projectId),
      desc: exact ? `${g.worker} · ${fmt(hours)} uur` : `${g.worker} · ${fmt(hours)} uur à € ${fmt(rate)}`,
      units: exact ? hours : 1,
      price: exact ? rate : amount,
    });
  }

  // Kostenregels per werf en soort samenvoegen: bij Pieter 260079 werden drie
  // posten (vervoer, transport, afval) × vier werven twaalf regels, terwijl
  // jullie in Holded één transportregel per werf boeken.
  const kosten = new Map<string, { projectId: string; kind: BookingKind; labels: string[]; amount: number }>();
  for (const c of src.costs) {
    const kind: BookingKind = TRANSPORT_RE.test(c.description) || c.category === "other" ? "transport" : c.category === "labor" ? "labor" : "material";
    // "Reiskosten · inkoopfactuur 0-14" → "Reiskosten"; de factuur zelf staat al in de kop.
    const label = c.description.split(" · inkoopfactuur")[0].replace(/^Inkoopfactuur\s+/i, "").trim() || c.description;
    const k = `${c.projectId}|${kind}`;
    const g = kosten.get(k) ?? { projectId: c.projectId, kind, labels: [], amount: 0 };
    if (!g.labels.includes(label)) g.labels.push(label);
    g.amount += c.amount;
    kosten.set(k, g);
  }
  for (const g of kosten.values()) {
    lines.push({
      key: `k${lines.length}`,
      kind: g.kind,
      crmProjectId: g.projectId,
      name: naam(g.projectId),
      desc: g.labels.join(", "),
      units: 1,
      price: round2(g.amount),
    });
  }

  if (lines.length === 0) {
    lines.push({
      key: "e0",
      kind: src.countAsLabor ? "labor" : "material",
      crmProjectId: src.poProjectId,
      name: naam(src.poProjectId),
      desc: src.fallbackDesc,
      units: 1,
      price: round2(src.exVat),
    });
  }
  return lines;
}

export const lineAmount = (l: Pick<HoldedPushLine, "units" | "price">) => round2(l.units * l.price);

/**
 * Effectief percentage van een Holded-belastingsleutel voor de controle van het
 * totaal. Een ISP-/intracom-paar (`… (-)` of zonder percentage) heft zichzelf op:
 * de leverancier rekent geen btw, dus telt het niet mee in wat je betaalt.
 */
export function effectiveRate(tax: { key: string; name: string; amount: string | null } | undefined): number {
  if (!tax || tax.amount == null) return 0;
  if (/\(-\)\s*$/.test(tax.name) || /invsuj|adqintra/.test(tax.key)) return 0;
  const n = Number(tax.amount);
  return Number.isFinite(n) ? n : 0;
}

export function bookingTotals(
  lines: Pick<HoldedPushLine, "units" | "price" | "vat" | "retention">[],
  taxes: Map<string, { key: string; name: string; amount: string | null }>,
): BookingTotals {
  let subtotal = 0, vat = 0, retention = 0;
  for (const l of lines) {
    const a = lineAmount(l);
    subtotal += a;
    vat += (a * effectiveRate(taxes.get(l.vat))) / 100;
    if (l.retention) retention += (a * Math.abs(effectiveRate(taxes.get(l.retention)))) / 100;
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  retention = round2(retention);
  return { subtotal, vat, retention, total: round2(subtotal + vat - retention) };
}

/** Wat er niet klopt aan een voorstel — leeg = mag naar Holded. */
export function bookingProblems(args: {
  lines: HoldedPushLine[];
  totals: BookingTotals;
  exVat: number;
  invoiceTotal: number;
  contactId: string | null;
  docNumber: string;
}): string[] {
  const p: string[] = [];
  const e = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!args.docNumber.trim()) p.push("Factuurnummer van de leverancier ontbreekt.");
  if (!args.contactId) p.push("Geen Holded-contact gekozen voor deze leverancier.");
  if (args.lines.length === 0) p.push("Geen regels.");
  for (const l of args.lines) {
    if (!l.account) p.push(`Regel "${l.name} — ${l.desc}": kies een grootboekrekening.`);
    if (l.crmProjectId && !l.holdedProjectId) p.push(`Regel "${l.name} — ${l.desc}": kies het Holded-project.`);
    if (!(l.units > 0) || !Number.isFinite(l.price)) p.push(`Regel "${l.name} — ${l.desc}": aantal of prijs klopt niet.`);
  }
  if (Math.abs(args.totals.subtotal - args.exVat) > 0.005)
    p.push(`De regels tellen op tot ${e(args.totals.subtotal)} ex btw, de factuur is ${e(args.exVat)} ex btw.`);
  if (Math.abs(args.totals.total - args.invoiceTotal) > 0.01)
    p.push(`Met deze btw/IRPF wordt het totaal ${e(args.totals.total)}, de factuur is ${e(args.invoiceTotal)}. Controleer btw en IRPF.`);
  return p;
}

export const purchaseTag = (poId: string) => `crm-po-${poId}`;

export function holdedPurchaseBody(args: {
  poId: string;
  contactId: string;
  docNumber: string;
  date: string;
  supplier: string;
  lines: HoldedPushLine[];
}): Record<string, unknown> {
  return {
    contact: args.contactId,
    docNumber: args.docNumber.trim(),
    date: Math.floor(Date.parse(`${args.date}T12:00:00Z`) / 1000),
    currency: "eur",
    // Concept: in Holded nog één keer goedkeuren. Later — als het altijd goed
    // gaat — kan dit definitief.
    draft: true,
    desc: `${args.supplier} · ${args.docNumber.trim()}`,
    tags: [purchaseTag(args.poId)],
    notes: `${purchaseTag(args.poId)}\nGeboekt vanuit het CRM (inkoopfactuur goedgekeurd).`,
    products: args.lines.map((l) => ({
      name: l.name,
      desc: l.desc,
      units: l.units,
      price: l.price,
      taxes: [l.vat, ...(l.retention ? [l.retention] : [])],
      account: l.account,
      ...(l.holdedProjectId ? { projectid: l.holdedProjectId } : {}),
    })),
  };
}

/** Vergelijkt wat Holded heeft opgeslagen met wat we stuurden. Leeg = in orde. */
export function verifyRemote(
  remote: { docNumber?: string; subtotal?: number; total?: number; products?: { account?: string; projectid?: string | null; units?: number; price?: number }[] },
  sent: { docNumber: string; lines: HoldedPushLine[]; totals: BookingTotals },
): string[] {
  const p: string[] = [];
  if ((remote.docNumber ?? "").trim() !== sent.docNumber.trim()) p.push(`Factuurnummer in Holded is "${remote.docNumber ?? ""}".`);
  if (Math.abs(Number(remote.subtotal) - sent.totals.subtotal) > 0.01) p.push(`Subtotaal in Holded is ${remote.subtotal}, verwacht ${sent.totals.subtotal}.`);
  if (Math.abs(Number(remote.total) - sent.totals.total) > 0.01) p.push(`Totaal in Holded is ${remote.total}, verwacht ${sent.totals.total}.`);
  const rp = remote.products ?? [];
  if (rp.length !== sent.lines.length) p.push(`Holded heeft ${rp.length} regels, verstuurd ${sent.lines.length}.`);
  sent.lines.forEach((l, i) => {
    const r = rp[i];
    if (!r) return;
    if (r.account !== l.account) p.push(`Regel ${i + 1}: grootboekrekening is in Holded anders opgeslagen.`);
    if ((r.projectid ?? null) !== (l.holdedProjectId ?? null)) p.push(`Regel ${i + 1}: project is in Holded anders opgeslagen.`);
  });
  return p;
}

/** Aantal regels waarvan rekening, btw, IRPF of project is aangepast t.o.v. het voorstel. */
export function changedFromProposal(proposed: HoldedPushLine[], sent: HoldedPushLine[]): number {
  const byKey = new Map(proposed.map((l) => [l.key, l]));
  return sent.filter((l) => {
    const p = byKey.get(l.key);
    return !p || p.account !== l.account || p.vat !== l.vat || p.retention !== l.retention || p.holdedProjectId !== l.holdedProjectId;
  }).length;
}
