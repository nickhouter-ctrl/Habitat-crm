import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { jsonCors, portalAuth, portalCors, tierPrice } from "@/lib/portal/api";

/**
 * Tier-prijzen voor het klantportal. ALLEEN met een geldige portal-token — dit is
 * de enige plek waar prijzen de CRM verlaten. Geeft per SKU de prijs (ex. btw) +
 * btw%, zodat de website het op de juiste maat/variant kan matchen.
 */
export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const tok = portalAuth(req);
  if (!tok) return jsonCors({ ok: false, error: "unauthorized" }, 401, origin);
  const tier = tok.tier;

  const rows = await db
    .select({
      sku: products.sku,
      priceEur: products.priceEur,
      tradePriceEur: products.tradePriceEur,
      vatRate: products.vatRate,
      additionalSizes: products.additionalSizes,
    })
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.pushToWebsite, true)));

  const out: Record<string, { price: number; vat: number }> = {};
  for (const p of rows) {
    const vat = p.vatRate ?? 21;
    if (p.sku) {
      const price = tierPrice(tier, p.priceEur, p.tradePriceEur);
      if (price != null) out[p.sku] = { price, vat };
    }
    // Aannemers-korting-factor van dit product (voor de losse maten).
    const base = p.priceEur != null ? Number(p.priceEur) : null;
    const trade = p.tradePriceEur != null ? Number(p.tradePriceEur) : null;
    const factor = tier === "aannemer" ? (base && trade && base > 0 ? trade / base : 0.8) : 1;
    for (const s of p.additionalSizes ?? []) {
      if (s.sku && s.priceEur != null) {
        out[s.sku] = { price: Math.round(Number(s.priceEur) * factor * 100) / 100, vat };
      }
    }
  }

  return jsonCors({ ok: true, tier, prices: out }, 200, origin);
}
