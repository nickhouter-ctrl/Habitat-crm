/**
 * Vul de productnamen-vertalingen aan in habitat-one/messages/{nl,de,en,es}.json
 * voor de producten zonder bestaande i18n-entry.
 *
 * Hard-coded translation patterns voor onze categorieën — de model-code
 * (bv. KKR-1261-1) blijft staan, het type-woord wordt vertaald.
 *
 *   npx tsx scripts/translate-new-product-names.ts                (dry run)
 *   npx tsx scripts/translate-new-product-names.ts --apply
 */
import "./load-env";
import { commitFiles, getTextFile } from "../lib/website/github-client";

const APPLY = process.argv.includes("--apply");

type Locale = "nl" | "de" | "en" | "es";

interface WP { id: number; slug: string; sku: string | null; name: string; }

// Per type een set vertalingen + de regex die de naam herkent. Earliest-match wins.
const PATTERNS: Array<{
  re: RegExp;
  translate: (m: RegExpMatchArray, name: string) => Record<Locale, string>;
}> = [
  {
    re: /^Bathtub Drainage \+ (.+ )?Drain Cover (.+)$/i,
    translate: (m) => ({
      nl: `Bad-afvoer + Afvoerdeksel ${m[2]}`,
      de: `Badewannenablauf + Ablaufdeckel ${m[2]}`,
      en: `Bathtub Drainage + Drain Cover ${m[2]}`,
      es: `Desagüe de Bañera + Tapa ${m[2]}`,
    }),
  },
  {
    re: /^Bathtub Rack (.+)$/i,
    translate: (m) => ({
      nl: `Badrek ${m[1]}`,
      de: `Wannenablage ${m[1]}`,
      en: `Bathtub Rack ${m[1]}`,
      es: `Estante para Bañera ${m[1]}`,
    }),
  },
  {
    re: /^Bathtub( .+)?$/i,
    translate: (m) => ({
      nl: `Bad${m[1] ?? ""}`,
      de: `Badewanne${m[1] ?? ""}`,
      en: `Bathtub${m[1] ?? ""}`,
      es: `Bañera${m[1] ?? ""}`,
    }),
  },
  {
    re: /^Wall Hung Basin( ?- ?)?(.+)?$/i,
    translate: (m) => ({
      nl: `Wandhangende Wastafel ${m[2] ?? ""}`.trim(),
      de: `Wandhängendes Waschbecken ${m[2] ?? ""}`.trim(),
      en: `Wall Hung Basin ${m[2] ?? ""}`.trim(),
      es: `Lavabo Suspendido ${m[2] ?? ""}`.trim(),
    }),
  },
  {
    re: /^Cabinet Basin (.+)$/i,
    translate: (m) => ({
      nl: `Wastafel met Onderkast ${m[1]}`,
      de: `Schrank-Waschbecken ${m[1]}`,
      en: `Cabinet Basin ${m[1]}`,
      es: `Lavabo con Mueble ${m[1]}`,
    }),
  },
  {
    re: /^Countertop Basin (.+)$/i,
    translate: (m) => ({
      nl: `Opzetwastafel ${m[1]}`,
      de: `Aufsatzwaschbecken ${m[1]}`,
      en: `Countertop Basin ${m[1]}`,
      es: `Lavabo Sobre Encimera ${m[1]}`,
    }),
  },
  {
    re: /^Freestanding Basin Drainage Set (.+)$/i,
    translate: (m) => ({
      nl: `Vrijstaande Wastafel-afvoerset ${m[1]}`,
      de: `Standwaschbecken-Ablaufset ${m[1]}`,
      en: `Freestanding Basin Drainage Set ${m[1]}`,
      es: `Conjunto de Desagüe para Lavabo Independiente ${m[1]}`,
    }),
  },
  {
    re: /^Freestanding Basin (.+)$/i,
    translate: (m) => ({
      nl: `Vrijstaande Wastafel ${m[1]}`,
      de: `Standwaschbecken ${m[1]}`,
      en: `Freestanding Basin ${m[1]}`,
      es: `Lavabo Independiente ${m[1]}`,
    }),
  },
  {
    re: /^Translucent Acrylic Solid Surface Sheet (.+)$/i,
    translate: (m) => ({
      nl: `Doorschijnende Acrylplaat ${m[1]}`,
      de: `Lichtdurchlässige Acrylplatte ${m[1]}`,
      en: `Translucent Acrylic Sheet ${m[1]}`,
      es: `Lámina Acrílica Translúcida ${m[1]}`,
    }),
  },
  {
    re: /^Modified Acrylic Solid Surface Sheet (.+)$/i,
    translate: (m) => ({
      nl: `Bewerkte Acrylplaat ${m[1]}`,
      de: `Modifizierte Acrylplatte ${m[1]}`,
      en: `Modified Acrylic Sheet ${m[1]}`,
      es: `Lámina Acrílica Modificada ${m[1]}`,
    }),
  },
  {
    re: /^Basin Taps$/i,
    translate: () => ({
      nl: "Wastafelkraan",
      de: "Waschtischarmatur",
      en: "Basin Taps",
      es: "Grifería de Lavabo",
    }),
  },
  {
    re: /^XPS Backer Board (.+)$/i,
    translate: (m) => ({
      nl: `XPS Onderplaat ${m[1]}`,
      de: `XPS Trägerplatte ${m[1]}`,
      en: `XPS Backer Board ${m[1]}`,
      es: `Placa Base XPS ${m[1]}`,
    }),
  },
  {
    re: /^Lime Dacite ?- ?(.+)$/i,
    translate: (m) => ({
      nl: `Kalkpaneel — ${m[1]}`,
      de: `Kalkstein-Paneel — ${m[1]}`,
      en: `Lime Dacite — ${m[1]}`,
      es: `Panel Dacita — ${m[1]}`,
    }),
  },
  {
    re: /^Wood Concrete board ?- ?(.+)$/i,
    translate: (m) => ({
      nl: `Houtbeton-paneel — ${m[1]}`,
      de: `Holzbeton-Paneel — ${m[1]}`,
      en: `Wood Concrete board — ${m[1]}`,
      es: `Panel Hormigón-Madera — ${m[1]}`,
    }),
  },
  {
    re: /^Inside Door( \d+)?$/i,
    translate: (m) => ({
      nl: `Binnendeur${m[1] ?? ""}`,
      de: `Innentür${m[1] ?? ""}`,
      en: `Inside Door${m[1] ?? ""}`,
      es: `Puerta Interior${m[1] ?? ""}`,
    }),
  },
  {
    re: /^Outside Door( \d+)?$/i,
    translate: (m) => ({
      nl: `Buitendeur${m[1] ?? ""}`,
      de: `Außentür${m[1] ?? ""}`,
      en: `Outside Door${m[1] ?? ""}`,
      es: `Puerta Exterior${m[1] ?? ""}`,
    }),
  },
  {
    re: /^Hinges ?\(binnen\)$/i,
    translate: () => ({
      nl: "Scharnieren (binnen)",
      de: "Scharniere (innen)",
      en: "Hinges (interior)",
      es: "Bisagras (interior)",
    }),
  },
];

function translate(name: string): Record<Locale, string> | null {
  for (const p of PATTERNS) {
    const m = name.trim().match(p.re);
    if (m) return p.translate(m, name);
  }
  return null;
}

async function main() {
  const pf = await getTextFile("tmp-data/products.json");
  if (!pf) throw new Error("Kan products.json niet ophalen");
  const products: WP[] = JSON.parse(pf.text);

  const messages: Record<Locale, { text: string; sha: string; data: { products: { i18n?: Record<string, { name?: string; short?: string }> } } }> = {} as never;
  for (const l of ["nl", "de", "en", "es"] as Locale[]) {
    const f = await getTextFile(`messages/${l}.json`);
    if (!f) throw new Error(`messages/${l}.json missing`);
    messages[l] = { text: f.text, sha: f.sha, data: JSON.parse(f.text) };
  }

  let added = 0;
  let skipped = 0;
  const log: string[] = [];

  for (const p of products) {
    // Skip producten die al een NL-vertaling hebben
    if (messages.nl.data.products.i18n?.[p.slug]?.name) { skipped++; continue; }
    const tr = translate(p.name);
    if (!tr) continue;
    for (const l of ["nl", "de", "en", "es"] as Locale[]) {
      const i18n = (messages[l].data.products.i18n ??= {});
      i18n[p.slug] = { ...(i18n[p.slug] ?? {}), name: tr[l] };
    }
    log.push(`  ${p.sku?.padEnd(14)}  ${p.name}\n     NL: ${tr.nl}`);
    added++;
  }

  console.log(`Toegevoegde vertalingen: ${added}`);
  console.log(`Al vertaald (skipped):    ${skipped}\n`);
  for (const l of log.slice(0, 50)) console.log(l);
  if (log.length > 50) console.log(`  … en ${log.length - 50} meer`);

  if (!added) { console.log("\nNiks te doen."); process.exit(0); }
  if (!APPLY) { console.log("\nDry run — voeg --apply toe."); process.exit(0); }

  const commit = await commitFiles({
    message: `feat(i18n): productnamen-vertalingen voor ${added} nieuwe producten`,
    files: (["nl", "de", "en", "es"] as Locale[]).map((l) => ({
      path: `messages/${l}.json`,
      content: JSON.stringify(messages[l].data, null, 2) + "\n",
    })),
  });
  console.log(`\n✅ Commit: ${commit.commitUrl}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
