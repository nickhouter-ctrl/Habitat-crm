import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Cijfers van Habitat One Windows (schema `windows` in dezelfde database):
 * per order de fabrieksprijs, kostprijs, dealerprijs, winst en de facturen van
 * Habitat aan de dealer. Alle bedragen komen als eurocenten uit Windows en
 * gaan hier naar euro's.
 *
 * Kostprijsketen (zoals in Windows ingesteld): kostprijs = fabrieksprijs ×
 * (1 + invoerkosten + handling); dealerprijs = kostprijs × (1 + Habitat-marge).
 */
export interface WindowsOrderRow {
  id: string;
  number: string;
  createdAt: Date;
  status: string;
  dealer: string;
  customer: string;
  project: string;
  m2: number;
  elements: number;
  /** Fabrieksprijs: definitief als de fabriek geoffreerd heeft, anders de raming uit de offerte. */
  factory: number;
  factoryFinal: boolean;
  /** Kostprijs Habitat (fabriek + invoer + handling). */
  cost: number;
  /** Prijs aan de dealer (definitief of geoffreerd). */
  dealer_price: number;
  /** Verkoopprijs van de dealer aan zijn klant (alleen ter informatie). */
  sell: number;
  profit: number;
  marginPct: number | null;
  invoiced: number;
  paid: number;
  open: number;
  leadTimeDays: number | null;
  plannedDelivery: string | null;
}

export interface WindowsReport {
  configured: boolean;
  orders: WindowsOrderRow[];
  totals: { orders: number; active: number; delivered: number; cost: number; dealer: number; profit: number; marginPct: number | null; invoiced: number; paid: number; open: number };
  quotes: { open: number; openValue: number; accepted: number };
  pricing: { importPct: number; handlingPct: number; habitatMarginPct: number };
}

const STATUS_LABEL: Record<string, string> = {
  received: "Binnengekomen",
  forwarded: "Naar fabriek",
  factory_review: "Bij fabriek",
  final_quote: "Definitieve offerte",
  confirmed: "Bevestigd",
  production: "In productie",
  shipped: "Verzonden",
  delivered: "Geleverd",
  cancelled: "Geannuleerd",
};

export function windowsStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

type OrderSql = {
  id: string;
  number: string;
  created_at: Date;
  status: string;
  dealer_name: string | null;
  dealer_email: string | null;
  snapshot: { totals: { cost: number; dealer: number; sell: number; totalM2: number }; elements: unknown[]; customer?: { name?: string }; projectName?: string };
  factory_final: { factoryPrice: number | null; dealerPrice: number | null; leadTimeDays: number | null } | null;
  planned_delivery: string | null;
  invoiced: string | number | null;
  paid: string | number | null;
};

export async function getWindowsReport(): Promise<WindowsReport> {
  const exists = (await db.execute(sql`select 1 from information_schema.tables where table_schema = 'windows' and table_name = 'orders' limit 1`)) as unknown as unknown[];
  if (exists.length === 0) return { configured: false, orders: [], totals: { orders: 0, active: 0, delivered: 0, cost: 0, dealer: 0, profit: 0, marginPct: null, invoiced: 0, paid: 0, open: 0 }, quotes: { open: 0, openValue: 0, accepted: 0 }, pricing: { importPct: 0.4, handlingPct: 0.15, habitatMarginPct: 0.4 } };

  // Prijsparameters zoals in Windows ingesteld (settings-tabel, anders de standaard).
  const settingsRows = (await db.execute(sql`select data from windows.settings limit 1`).catch(() => [])) as unknown as { data: { habitatMarginPct?: number; pricing?: { importDutyPct?: number; handlingPct?: number } } }[];
  const s = settingsRows[0]?.data ?? {};
  const pricing = { importPct: s.pricing?.importDutyPct ?? 0.4, handlingPct: s.pricing?.handlingPct ?? 0.15, habitatMarginPct: s.habitatMarginPct ?? 0.4 };
  const uplift = 1 + pricing.importPct + pricing.handlingPct;

  const rows = (await db.execute(sql`
    select o.id, o.number, o.created_at, o.status, d.company_name as dealer_name, d.email as dealer_email,
           o.snapshot, o.factory_final, o.planned_delivery,
           (select coalesce(sum(i.net_cents), 0) from windows.invoices i where i.order_id = o.id and i.issuer = 'habitat' and i.status <> 'cancelled') as invoiced,
           (select coalesce(sum(i.net_cents), 0) from windows.invoices i where i.order_id = o.id and i.issuer = 'habitat' and i.status = 'paid') as paid
    from windows.orders o
    left join windows.dealers d on d.id = o.dealer_id
    order by o.created_at desc`)) as unknown as OrderSql[];

  const orders: WindowsOrderRow[] = rows.map((r) => {
    const t = r.snapshot.totals;
    const ff = r.factory_final;
    const factoryFinal = !!(ff && ff.factoryPrice != null);
    const factory = factoryFinal ? ff!.factoryPrice! : Math.round(t.cost / uplift);
    const cost = factoryFinal ? Math.round(factory * uplift) : t.cost;
    const dealerPrice = ff?.dealerPrice ?? t.dealer;
    const profit = dealerPrice - cost;
    const invoiced = Number(r.invoiced ?? 0);
    const paid = Number(r.paid ?? 0);
    return {
      id: r.id,
      number: r.number,
      createdAt: new Date(r.created_at),
      status: r.status,
      dealer: r.dealer_name ?? r.dealer_email ?? "Habitat (eigen project)",
      customer: r.snapshot.customer?.name ?? "",
      project: r.snapshot.projectName ?? "",
      m2: t.totalM2,
      elements: r.snapshot.elements.length,
      factory: factory / 100,
      factoryFinal,
      cost: cost / 100,
      dealer_price: dealerPrice / 100,
      sell: t.sell / 100,
      profit: profit / 100,
      marginPct: cost > 0 ? profit / cost : null,
      invoiced: invoiced / 100,
      paid: paid / 100,
      open: (invoiced - paid) / 100,
      leadTimeDays: ff?.leadTimeDays ?? null,
      plannedDelivery: r.planned_delivery,
    };
  });

  const live = orders.filter((o) => o.status !== "cancelled");
  const sum = (f: (o: WindowsOrderRow) => number) => live.reduce((a, o) => a + f(o), 0);
  const cost = sum((o) => o.cost);
  const dealer = sum((o) => o.dealer_price);
  const totals = {
    orders: live.length,
    active: live.filter((o) => o.status !== "delivered").length,
    delivered: live.filter((o) => o.status === "delivered").length,
    cost,
    dealer,
    profit: dealer - cost,
    marginPct: cost > 0 ? (dealer - cost) / cost : null,
    invoiced: sum((o) => o.invoiced),
    paid: sum((o) => o.paid),
    open: sum((o) => o.open),
  };

  const q = (await db.execute(sql`
    select status, count(*)::int as n, coalesce(sum((snapshot->'totals'->>'dealer')::bigint), 0) as dealer_value
    from windows.quotes group by status`)) as unknown as { status: string; n: number; dealer_value: string | number }[];
  const openQ = q.filter((x) => x.status === "draft" || x.status === "sent");
  const quotes = { open: openQ.reduce((a, x) => a + x.n, 0), openValue: openQ.reduce((a, x) => a + Number(x.dealer_value), 0) / 100, accepted: q.find((x) => x.status === "accepted")?.n ?? 0 };

  return { configured: true, orders, totals, quotes, pricing };
}
