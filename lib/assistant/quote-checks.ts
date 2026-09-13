import type { DocumentLineItem } from "@/lib/db/schema";
export function checkQuote(items: DocumentLineItem[], catalog: Map<string, number> = new Map()): string[] {
  const checks: string[] = [];
  if (!items.length) return ["De offerte heeft nog geen regels."];
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const label = `Regel ${index + 1} (${item.name || "zonder naam"})`;
    if (!item.name?.trim()) checks.push(`${label}: omschrijving ontbreekt.`);
    if (!Number.isFinite(item.units) || item.units <= 0) checks.push(`${label}: controleer het aantal.`);
    if (!Number.isFinite(item.price) || item.price <= 0) checks.push(`${label}: controleer de verkoopprijs.`);
    if (item.taxRate == null) checks.push(`${label}: btw-percentage is niet expliciet ingevuld.`);
    const net = item.price * (1 - (item.discount ?? 0) / 100);
    if (item.pricingBasis === "construction") {
      if (item.costEur == null) checks.push(`${label}: kostprijs ontbreekt; 15% opslag is niet te controleren.`);
      else if (Math.abs(net - Math.round(item.costEur * 1.15 * 100) / 100) > 0.02)
        checks.push(`${label}: verkoopprijs wijkt af van kostprijs + 15%; controleer korting of afwijkende afspraak.`);
    }
    if (item.productId && item.pricingBasis !== "construction") {
      const normal = catalog.get(item.productId);
      if (normal != null && Math.abs(item.price - normal) > 0.02)
        checks.push(`${label}: prijs wijkt af van de huidige catalogusprijs; controleer op extra opslag of een bewuste prijsafspraak.`);
    }
    const key = [item.productId ?? item.name, item.units, item.price, item.phase ?? ""].join("|");
    if (seen.has(key)) checks.push(`${label}: mogelijk dubbele regel; controleer of deze bewust is opgenomen.`);
    seen.add(key);
  }
  return checks;
}
