/**
 * Vertaling van ETHICK-productnamen + omschrijvingen voor de prijslijst.
 *
 * De ETHICK-bloempotten en -loungers zijn in het CRM met Nederlandse namen
 * opgeslagen ("Bloempot Ulpho TUO40 — zand"). Voor een anderstalige prijslijst
 * stellen we de naam opnieuw samen: vertaald voorvoegsel + (merk)model + SKU +
 * vertaalde kleur. De kleurcode komt uit de SKU (laatste segment, bv. 101GR).
 */
import type { PricelistLocale } from "@/lib/pricelist-pdf";

/** Kleurcode (suffix van de SKU) → kleurnaam per taal. */
const COLOURS: Record<string, Record<PricelistLocale, string>> = {
  "101GR": { nl: "zand", de: "Sand", en: "sand", es: "arena" },
  "102GR": { nl: "zout", de: "Salz", en: "salt", es: "sal" },
  "106GR": { nl: "betongrijs", de: "Betongrau", en: "concrete grey", es: "gris cemento" },
  "107GR": { nl: "grafiet", de: "Graphit", en: "graphite", es: "grafito" },
  "109GR": { nl: "antraciet", de: "Anthrazit", en: "charcoal", es: "antracita" },
  "220R": { nl: "roodbruin", de: "Rotocker", en: "red ochre", es: "ocre rojo" },
  "231R": { nl: "macchiato", de: "Macchiato", en: "macchiato", es: "macchiato" },
  "243R": { nl: "terracotta", de: "Terrakotta", en: "terracotta", es: "terracota" },
  "440R": { nl: "wit", de: "Weiß", en: "white", es: "blanco" },
  "460GR": { nl: "graniet", de: "Granit", en: "granite", es: "granito" },
  "467R": { nl: "zwart", de: "Schwarz", en: "black", es: "negro" },
};

/** Productsoort → voorvoegsel per taal. */
const PREFIX: Record<"pot" | "lounger", Record<PricelistLocale, string>> = {
  pot: { nl: "Bloempot", de: "Blumentopf", en: "Flower pot", es: "Maceta" },
  lounger: { nl: "Lounger", de: "Sonnenliege", en: "Lounger", es: "Tumbona" },
};

/**
 * Gelokaliseerde naam + omschrijving voor een ETHICK-product.
 * `null` als het geen ETHICK-bloempot/-lounger is (dan ongewijzigd laten).
 */
export function localizeEthick(
  row: { name: string; sku: string | null; collection: string | null },
  locale: PricelistLocale,
): { name: string; description: string } | null {
  const kind =
    row.collection === "Bloempotten" ? "pot" : row.collection === "Tuinmeubilair" ? "lounger" : null;
  if (!kind) return null;

  // Naam ontleden: "Voorvoegsel Model SKU — kleur"
  const [left, ...rest] = row.name.split(" — ");
  const storedColour = rest.join(" — ").trim();
  const words = left.trim().split(/\s+/);
  words.shift(); // het Nederlandse voorvoegsel eraf
  const middle = words.join(" "); // bv. "Ulpho TUO40" / "Capre FCAK1867R"
  const modelMain = words[0] ?? "";

  const code = (row.sku?.split("-").pop() ?? "").toUpperCase();
  const colour = COLOURS[code]?.[locale] ?? storedColour;

  const name = `${PREFIX[kind][locale]} ${middle} — ${colour}`.replace(/\s+/g, " ").trim();
  const description = `ETHICK ${modelMain} — ${colour}.`;
  return { name, description };
}
