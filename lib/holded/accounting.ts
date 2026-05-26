/**
 * Trek de "boekhoudkundige" cijfers rechtstreeks uit Holded's grootboek
 * (Daily Ledger). Dit is de échte boekhoudbron — in EUR, zonder onze
 * eigen koers-aannames — die exact matcht met wat de boekhouder ziet.
 *
 * Spaans rekeningstelsel (PGC):
 *   6xxxxxxx → Gastos (kosten / uitgaven)
 *   7xxxxxxx → Ingresos (omzet)
 */
import { unstable_cache } from "next/cache";

import { holded } from "./client";

interface LedgerLine {
  entryNumber?: number;
  line?: number;
  timestamp?: number;
  type?: string;
  description?: string;
  docDescription?: string;
  account?: number | string;
  debit?: number;
  credit?: number;
  tags?: string[];
}

type Cached = { fetchedAt: number; data: LedgerLine[] };
const cache = new Map<string, Cached>();
const TTL_MS = 30 * 60 * 1000; // 30 min — boekhouding verandert niet seconde-tot-seconde

async function fetchLedger(starttmp: number, endtmp: number): Promise<LedgerLine[]> {
  const key = `${starttmp}:${endtmp}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.data;
  try {
    const rows = await holded.request<LedgerLine[]>(
      `/accounting/v1/dailyledger?starttmp=${starttmp}&endtmp=${endtmp}`,
    );
    cache.set(key, { fetchedAt: Date.now(), data: Array.isArray(rows) ? rows : [] });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function ymKey(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfYearTs(year: number): number {
  return Math.floor(Date.UTC(year, 0, 1) / 1000);
}

/** Uitgaven (kosten) per maand uit Holded's grootboek, in EUR. */
export async function expensesByMonth(months = 12): Promise<{ ym: string; total: number }[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const lines = await fetchLedger(Math.floor(start.getTime() / 1000), Math.floor(Date.now() / 1000));
  const byMonth = new Map<string, number>();
  for (const r of lines) {
    if (!r.timestamp) continue;
    const acc = String(r.account ?? "");
    if (!acc.startsWith("6")) continue; // alleen kostenrekeningen
    const ym = ymKey(r.timestamp);
    const net = Number(r.debit || 0) - Number(r.credit || 0);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + net);
  }
  // garandeer dat alle maanden aanwezig zijn
  const out: { ym: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ ym, total: Math.round((byMonth.get(ym) ?? 0) * 100) / 100 });
  }
  return out;
}

/** Omzet (ingresos) per maand uit Holded's grootboek, in EUR. */
export async function revenueByMonth(months = 12): Promise<{ ym: string; total: number }[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const lines = await fetchLedger(Math.floor(start.getTime() / 1000), Math.floor(Date.now() / 1000));
  const byMonth = new Map<string, number>();
  for (const r of lines) {
    if (!r.timestamp) continue;
    const acc = String(r.account ?? "");
    if (!acc.startsWith("7")) continue; // omzetrekeningen
    const ym = ymKey(r.timestamp);
    // Omzet zit standaard aan creditkant van 7xxxxxxx (credit > debit).
    const net = Number(r.credit || 0) - Number(r.debit || 0);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + net);
  }
  const out: { ym: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ ym, total: Math.round((byMonth.get(ym) ?? 0) * 100) / 100 });
  }
  return out;
}

/** Eén-getal helpers — kalenderjaar (YTD). */
export async function expensesYTD(): Promise<number> {
  const start = startOfYearTs(new Date().getFullYear());
  const lines = await fetchLedger(start, Math.floor(Date.now() / 1000));
  let sum = 0;
  for (const r of lines) {
    if (!String(r.account ?? "").startsWith("6")) continue;
    sum += Number(r.debit || 0) - Number(r.credit || 0);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Sommatie zoals Holded's aankoopfacturen-overzicht: subtotaal (ex BTW) over
 * alle purchase-documenten, currency-naive (Holded telt USD-getallen en EUR-
 * getallen bij elkaar op zoals ze in het document staan). Klopt 1-op-1 met
 * wat je in Holded ziet onder "Aankoopfacturen".
 */
/**
 * Eén Holded-fetch per 30 min, gedeeld over alle function-instances via Next's
 * Data Cache. Zonder dit blokkeerde elke cold-start van het dashboard op een
 * trage externe API.
 */
const fetchPurchaseDocs = unstable_cache(
  async (): Promise<{ subtotal: number; byMonth: Record<string, number> }> => {
    try {
      const docs = await holded.request<Array<{ subtotal?: number; date?: number; currency?: string }>>(
        `/invoicing/v1/documents/purchase`,
      );
      let subtotal = 0;
      const byMonth: Record<string, number> = {};
      for (const d of docs ?? []) {
        const s = Number(d.subtotal || 0);
        subtotal += s; // currency-naive optelling (matcht Holded UI)
        if (d.date) {
          const ym = ymKey(d.date);
          byMonth[ym] = (byMonth[ym] ?? 0) + s;
        }
      }
      return { subtotal, byMonth };
    } catch {
      return { subtotal: 0, byMonth: {} };
    }
  },
  ["holded-purchase-docs-v1"],
  { revalidate: 1800 },
);

export async function purchaseDocsTotalExBTW(): Promise<number> {
  const c = await fetchPurchaseDocs();
  return Math.round(c.subtotal * 100) / 100;
}

export async function purchaseDocsByMonth(months = 12): Promise<{ ym: string; total: number }[]> {
  const c = await fetchPurchaseDocs();
  const now = new Date();
  const out: { ym: string; total: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ ym, total: Math.round((c.byMonth[ym] ?? 0) * 100) / 100 });
  }
  return out;
}

export async function revenueYTD(): Promise<number> {
  const start = startOfYearTs(new Date().getFullYear());
  const lines = await fetchLedger(start, Math.floor(Date.now() / 1000));
  let sum = 0;
  for (const r of lines) {
    if (!String(r.account ?? "").startsWith("7")) continue;
    sum += Number(r.credit || 0) - Number(r.debit || 0);
  }
  return Math.round(sum * 100) / 100;
}
