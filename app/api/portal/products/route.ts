import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { jsonCors, portalAuth, portalCors, tierPrice } from "@/lib/portal/api";

/**
 * Tier-prijzen voor het klantportal. ALLEEN met een geldige portal-token — dit is
 * de enige plek waar prijzen de CRM verlaten. Geeft per SKU de prijs (ex. btw) +
 * btw%, én een op-naam-lijst (`byName`) voor producten die op de site geen
 * matchende SKU hebben (bv. de Flexibel Stone-panelen uit de losse catalogus).
 */
export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
}

/** Meubelcollecties: nooit automatische aannemerskorting — korting geeft Habitat zelf. */
const NO_TRADE_DISCOUNT = new Set(["Caracole", "Cornelius Lifestyle"]);

/** Grondnaam: strip kleur-suffix (" - Wit") en trailing (MS-xxx), lowercase. */
function baseName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+[-–]\s+[^-–]+$/, "")
    .trim()
    .toLowerCase();
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const tok = portalAuth(req);
  if (!tok) return jsonCors({ ok: false, error: "unauthorized" }, 401, origin);
  const tier = tok.tier;

  const rows = await db
    .select({
      name: products.name,
      sku: products.sku,
      collection: products.collection,
      priceEur: products.priceEur,
      tradePriceEur: products.tradePriceEur,
      vatRate: products.vatRate,
      additionalSizes: products.additionalSizes,
    })
    .from(products)
    .where(and(eq(products.isActive, true), isNotNull(products.priceEur)));

  const out: Record<string, { price: number; vat: number }> = {};
  // Per grondnaam: verzamel prijzen → kies de meest voorkomende (tie: hoogste).
  const nameLists = new Map<string, { prices: number[]; vat: number }>();

  for (const p of rows) {
    const vat = p.vatRate ?? 21;
    // Meubels: altijd de normale prijs (geen aannemerskorting).
    const effTier = p.collection && NO_TRADE_DISCOUNT.has(p.collection) ? "particulier" : tier;
    const price = tierPrice(effTier, p.priceEur, p.tradePriceEur);
    if (price != null) {
      if (p.sku) out[p.sku] = { price, vat };
      const bn = baseName(p.name);
      if (bn) {
        const entry = nameLists.get(bn) ?? { prices: [], vat };
        entry.prices.push(price);
        nameLists.set(bn, entry);
      }
    }
    const base = p.priceEur != null ? Number(p.priceEur) : null;
    const trade = p.tradePriceEur != null ? Number(p.tradePriceEur) : null;
    const factor = effTier === "aannemer" ? (base && trade && base > 0 ? trade / base : 0.8) : 1;
    for (const s of p.additionalSizes ?? []) {
      if (s.sku && s.priceEur != null) {
        out[s.sku] = { price: Math.round(Number(s.priceEur) * factor * 100) / 100, vat };
      }
    }
  }

  const byName: Record<string, { price: number; vat: number }> = {};
  for (const [bn, { prices, vat }] of nameLists) {
    const counts = new Map<number, number>();
    for (const v of prices) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = prices[0];
    let bestC = 0;
    for (const [v, c] of counts) if (c > bestC || (c === bestC && v > best)) ((best = v), (bestC = c));
    byName[bn] = { price: best, vat };
  }

  return jsonCors({ ok: true, tier, prices: out, byName }, 200, origin);
}
