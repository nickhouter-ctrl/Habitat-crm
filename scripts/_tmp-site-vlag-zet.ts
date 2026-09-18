import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
/** Losse onderdelen en setgebonden delen blijven in het CRM (bestelbaar), maar horen niet op de site. */
const CATEGORIE_NIET = new Set(["Douchewand-onderdelen", "Onderdelen", "Kraan-onderdelen", "Badkamermeubels"]);
const NAAM_NIET = new RegExp(
  [
    // losse glasdelen en beslag van het douchewandprogramma
    "^(Wand W\\d|Wand |Deur D\\d|Deur |Badwand B\\d|Draaibare zijwand|Wanddeel|Glasdeel|T-koppelstuk|Topbladbeugel|Handgreep|Handgrepen|Stabilisatiestang|Glascoating|Muurprofiel|Hoekprofiel|Glasscharnier|Wandscharnier|Wandbevestiging|Hoekbevestiging|Kunststof profielen)",
    "pakket (deur|zijwand)", "glaspakket", "beslagpakket",
    // douchebak-toebehoren horen bij de bak, niet los in het overzicht
    "^(Afvoerrooster|Wirquin)", "sifon extra ondiep", "tbv douchebak",
    // inbouwdelen, stopkranen, slangen, houders — bestelbaar, niet etaleren
    "losse inbouw", "stopkraan", "met in- en afbouwdelen", "^Doucheslang", "aansluitslang", "^Stripe (met wateruitlaat|Wandhouder)$", "^Wandhouder", "Gebogen uitloop met rozet", "Badafvoer met overloop", "^Badvulcombinatie",
    // fragmenten en restjes
    "^Overig$", "^Voor je toiletruimte$", "met planchet$", "^Los multifunctioneel rooster", "^Losse standaard roosters",
  ].join("|"),
  "i",
);
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const rows = await db.select({ id: products.id, name: products.name, category: products.category }).from(products).where(eq(products.brandId, merk.id));
  let aan = 0; const uit: string[] = [];
  for (const r of rows) {
    const niet = CATEGORIE_NIET.has(r.category ?? "") || NAAM_NIET.test(r.name);
    await db.update(products).set({ pushToWebsite: !niet, updatedAt: new Date() }).where(eq(products.id, r.id));
    if (niet) uit.push(`${r.name} [${r.category}]`); else aan++;
  }
  console.log(`op site: ${aan}, niet op site: ${uit.length}`);
  // fragmentnamen uit de catalogus-extractie netjes maken
  const hernoem: Array<[string, string]> = [
    ["multifunctioneel rooster en flens", "Douchegoot met multifunctioneel rooster en flens"],
    ["tegelinlegrooster en flens", "Douchegoot met tegelinlegrooster en flens"],
    ["Inbouwnis mm", "Inbouwnis"],
    ["Regendouche Ø (douchekop)", "Regendouchekop"],
  ];
  for (const [van, naar] of hernoem) {
    const r = await db.update(products).set({ name: naar, updatedAt: new Date() }).where(and(eq(products.brandId, merk.id), eq(products.name, van))).returning({ id: products.id });
    if (r.length) console.log(`hernoemd: ${van} → ${naar}`);
  }
  // de douchebaksifon en het afvoerrooster horen bij de bak: in de omschrijving
  const [bak] = await db.select({ id: products.id, description: products.description }).from(products).where(and(eq(products.brandId, merk.id), eq(products.name, "Asteroid douchebak")));
  if (bak && !(bak.description ?? "").includes("douchebaksifon")) {
    const extra = "Bijpassend afvoerrooster (in alle kleuren) en de extra ondiepe Wirquin-douchebaksifon leveren we bij de bak mee.";
    await db.update(products).set({ description: [bak.description, extra].filter(Boolean).join("\n\n"), updatedAt: new Date() }).where(eq(products.id, bak.id));
    console.log("Asteroid: sifon en rooster in de omschrijving");
  }
  console.log(uit.filter((u) => !u.includes("[Badkamermeubels]") && !u.includes("[Onderdelen]") && !u.includes("[Douchewand-onderdelen]")).join("\n"));
  process.exit(0);
}
main();
