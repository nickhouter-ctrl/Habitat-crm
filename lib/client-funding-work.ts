import { splitLooseCost, splitPurchaseCost } from "@/lib/project-cost-streams";

/**
 * Het afgeboekte werk per factuur/week voor het voorschotoverzicht van de klant
 * (Nick 26-11-2026: "gewoon een lijst met alle facturen die wij hebben betaald,
 * hoe wij die hebben betaald is niet relevant").
 *
 * Bedragen zijn klantprijzen (kost × projectopslag), zoals Nick koos: zo sluit
 * de lijst op de cent op "Totaal afgeboekt werk" en staat er geen kostprijs of
 * opslag in de PDF. Arbeid per week per ploeg. Pure functies — geen db.
 */

export type WorkLaborEntry = { date: string; crew: string | null; hours: number | string; cost: number | string };
type PurchaseIn = Parameters<typeof splitPurchaseCost>[0] & { date?: string | null; reference?: string | null };
type CostIn = Parameters<typeof splitLooseCost>[0] & { date?: string | null };

export type ClientWorkRow = {
  /** Eerste dag (bij arbeid: maandag van de week). */
  date: string | null;
  /** Bij arbeid: laatste gewerkte dag van die week. */
  endDate?: string | null;
  kind: "labor" | "material" | "other";
  description: string;
  hours?: number;
  amount: number;
};

const cents = (n: number) => Math.round(n * 100);

/** Maandag van de ISO-week (UTC, datums zijn kalenderdagen). */
export function weekStart(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** "Ahmed Bouzekri (Construcciones Ahmed Javea)" → "Ahmed Bouzekri"; HOOFDLETTERS → Gewoon. */
export function crewLabel(name: string | null | undefined): string {
  const base = (name ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return "Ploeg";
  return base.split(" ").map(w => (w === w.toUpperCase() || w === w.toLowerCase()) && w.length > 1 && !w.includes(".")
    ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
}

/** Interne aantekeningen (contant, naar rato, wie het kocht) horen niet bij de klant. */
const internal = /\b(contant|cash|naar rato|verdeeld over|aandeel in|gekocht door|overige regels)\b|€/i;
export function clientCostLabel(text: string): string {
  const cleaned = text
    .replace(/\s*\((gekocht door|via|contant)[^)]*\)/gi, "")
    .replace(/[-\s]*\b(contant|cash)\b(\s+via)?(\s+[A-Z][a-z]+)?/g, "");
  const parts = cleaned.split(/\s+[—·]\s+/).map(s => s.trim()).filter(Boolean);
  const kept = parts.filter((p, i) => i === 0 || !internal.test(p));
  return kept.join(" — ").replace(/\binkoopfactuur\b/gi, "factuur").replace(/^factuur/, "Factuur")
    .replace(/\s*-\s*SIL\b/g, "").replace(/[\s—·-]+$/, "").replace(/\s+/g, " ").trim();
}

function purchaseLabel(p: PurchaseIn): string {
  const supplier = (p.supplier ?? "").trim();
  const ref = (p.reference ?? "").trim();
  const label = !ref ? supplier : ref.toLowerCase().includes(supplier.toLowerCase()) || !supplier ? ref : `${supplier} ${ref}`;
  return clientCostLabel(label || "Factuur");
}

/**
 * Verdeel `target` (klantprijs van een stroom) over rijen naar rato van hun
 * kost; afronding gaat naar de grootste rij, zodat het op de cent sluit.
 */
function allocate<T extends { cost: number }>(items: T[], target: number): (T & { amount: number })[] {
  const totalCost = items.reduce((s, it) => s + it.cost, 0);
  if (!items.length) return [];
  const out = items.map(it => ({ ...it, amount: totalCost ? cents(target * it.cost / totalCost) / 100 : 0 }));
  const diff = cents(target) - out.reduce((s, r) => s + cents(r.amount), 0);
  if (diff) {
    const big = out.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    big.amount = (cents(big.amount) + diff) / 100;
  }
  return out;
}

export function clientWorkRows(input: {
  labor: WorkLaborEntry[];
  purchases: PurchaseIn[];
  costs: CostIn[];
  laborRevenue: number;
  purchaseRevenue: number;
  otherRevenue: number;
}): ClientWorkRow[] {
  // Arbeid: per week per ploeg.
  const weeks = new Map<string, { date: string; endDate: string; crew: string; hours: number; cost: number }>();
  for (const e of input.labor) {
    const date = String(e.date).slice(0, 10);
    const crew = crewLabel(e.crew);
    const key = `${weekStart(date)}|${crew.toLowerCase()}`;
    const w = weeks.get(key) ?? { date: weekStart(date), endDate: date, crew, hours: 0, cost: 0 };
    w.hours += Number(e.hours) || 0;
    w.cost += Number(e.cost) || 0;
    if (date > w.endDate) w.endDate = date;
    weeks.set(key, w);
  }
  const labor = allocate([...weeks.values()].filter(w => w.cost !== 0), input.laborRevenue).map(w => ({
    date: w.date, endDate: w.endDate, kind: "labor" as const, hours: Math.round(w.hours * 100) / 100,
    description: w.crew, amount: w.amount,
  }));

  // Materiaal en overige: per factuur/kostenpost, zelfde verdeling als de projectstand.
  const goods: { date: string | null; description: string; material: number; other: number }[] = [
    ...input.purchases.map(p => ({ p: splitPurchaseCost(p), date: p.date ?? null, description: purchaseLabel(p) })),
    ...input.costs.map(c => ({ p: splitLooseCost(c), date: c.date ?? null, description: clientCostLabel(c.description) })),
  ].map(x => ({ date: x.date ? String(x.date).slice(0, 10) : null, description: x.description, material: x.p.material, other: x.p.other }));
  const material = allocate(goods.filter(g => g.material !== 0).map(g => ({ ...g, cost: g.material })), input.purchaseRevenue);
  const other = allocate(goods.filter(g => g.other !== 0).map(g => ({ ...g, cost: g.other })), input.otherRevenue);
  const goodsRows = [
    ...material.map(g => ({ date: g.date, kind: "material" as const, description: g.description, amount: g.amount })),
    ...other.map(g => ({ date: g.date, kind: "other" as const, description: g.description, amount: g.amount })),
  ];

  return [...labor, ...goodsRows].filter(r => r.amount !== 0)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.kind.localeCompare(b.kind) || a.description.localeCompare(b.description));
}
