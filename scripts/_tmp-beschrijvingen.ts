/**
 * Productuitleg uit de Brauer-catalogi: per product de catalogustekst van de pagina's van zijn
 * uitvoeringen (+ vorige pagina) → Claude schrijft een beschrijving (NL) in zes talen, alleen op
 * basis van die tekst. Opslag: products.description (NL) + products.description_i18n.
 *   npx tsx --env-file=.env.local scripts/_tmp-beschrijvingen.ts [--limit N] [--force] [--naam tekst]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const D = "/Users/nickhouter/Downloads";
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const LIMIT = Number(arg("limit") ?? 0), FORCE = process.argv.includes("--force"), NAAM = arg("naam"), KORT = process.argv.includes("--kort");
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const CAT: Record<string, string> = { kranen: "BRAUER Catalogus_Kranenprogramma_digitaal_v29012026.pdf", glas: "BRAUER Catalogus Glasprogramma 2026_digitaal_v22062026.pdf", meubel: "BRAUER Catalogus Meubelprogramma_digitaal_v09022026.pdf" };

/** Paginateksten één keer uit de PDF's halen (python/fitz) en cachen. */
function paginas(): Record<string, string[]> {
  const cache = `${S}/brauer-catalogus-tekst.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const py = `import fitz,json,sys\nout={}\nfor k,f in ${JSON.stringify(CAT)}.items():\n    d=fitz.open('${D}/'+f); out[k]=[p.get_text() for p in d]\njson.dump(out,open('${cache}','w'))`;
  execFileSync("python3", ["-c", py]);
  return JSON.parse(readFileSync(cache, "utf8"));
}
/** code → [catalogus, pagina] uit de csv's. */
function codePaginas(): Map<string, [string, number]> {
  const m = new Map<string, [string, number]>();
  for (const [cat, f] of [["kranen", "brauer-kranen.csv"], ["glas", "brauer-glas.csv"], ["meubel", "brauer-meubel.csv"]] as const) {
    const lines = readFileSync(`${D}/${f}`, "utf8").split(/\r?\n/); const kop = lines[0].split(";").map((k) => k.trim()); const ic = kop.indexOf("artikelcode"), ib = kop.indexOf("bron");
    for (const l of lines.slice(1)) { const c = l.split(";"); const p = c[ib]?.match(/p(\d+)/); if (c[ic] && p) m.set(c[ic].trim().toUpperCase(), [cat, Number(p[1])]); }
  }
  return m;
}
const opschonen = (t: string) => t.replace(/^#\s*[A-Z0-9-]+$/gm, "").replace(/^€\s*[\d.,]+$/gm, "").replace(/\n{3,}/g, "\n\n");

async function claude(naam: string, categorie: string, tekst: string): Promise<Record<string, string> | null> {
  const system = `Je schrijft productuitleg voor de website van Habitat One (badkamerspecialist, Jávea) over producten van het merk BRAUER. Je krijgt de tekst van de catalogus-pagina's waar dit product op staat. Schrijf ALLEEN op basis van die tekst; verzin niets, noem geen prijzen, artikelnummers of paginanummers. Sla tekst over andere producten over.

Opbouw (platte tekst): één inleidende alinea van 2–4 zinnen (wat is het, waarvoor, wat maakt het bijzonder), daarna 1 tot 3 korte kopjes met daaronder opsommingstekens of een korte alinea — bijvoorbeeld "Kwaliteit en afwerking", "Duurzaamheid en waterverbruik", "Montage". Kopjes schrijf je als regel die begint met "## ", opsommingen als regels die beginnen met "- ". Lege regel tussen blokken. Toon: helder, warm, niet wollig, geen uitroeptekens, geen "wij"/"onze" voor Brauer (schrijf "BRAUER" of "het merk"). Max. ± 160 woorden per taal.

Geef ALLEEN een JSON-object terug: {"nl": "...", "en": "...", "de": "...", "es": "...", "fr": "...", "zh": "..."} — dezelfde inhoud in Nederlands, Engels, Duits, Spaans, Frans en Chinees (vereenvoudigd), elk op moedertaalniveau. Staat er in de tekst niets bruikbaars over dit product, geef dan {"leeg": true}.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages: [{ role: "user", content: `Product: ${naam}\nCategorie: ${categorie}\n\nCatalogustekst:\n${tekst}` }] }),
  });
  if (!res.ok) { console.error("API", res.status, (await res.text()).slice(0, 200)); return null; }
  const j = (await res.json()) as { content: { text?: string }[] };
  const raw = (j.content?.[0]?.text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { const o = JSON.parse(raw); return o.leeg ? null : o; } catch { console.error("geen JSON:", raw.slice(0, 120)); return null; }
}

async function main() {
  const pag = paginas(), cp = codePaginas();
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  let prods = (await db.select().from(products).where(eq(products.brandId, merk.id))).filter((p) => p.pushToWebsite && (FORCE || !p.descriptionI18n) && (!NAAM || p.name.includes(NAAM)));
  if (LIMIT) prods = prods.slice(0, LIMIT);
  let n = 0, leeg = 0;
  const wacht = prods.slice(); const werk = async () => { for (let p = wacht.shift(); p; p = wacht.shift()) await doe(p); };
  const doe = async (p: typeof prods[number]) => {
    const vs = await db.select({ code: productVariants.code }).from(productVariants).where(eq(productVariants.productId, p.id));
    const refs = new Set<string>();
    for (const v of vs) { let r = cp.get(v.code.toUpperCase()); if (!r) { const d = v.code.toUpperCase().split("-"); while (d.length > 2 && !r) { d.pop(); r = cp.get(d.join("-")); } } if (r) { refs.add(`${r[0]}:${r[1]}`); if (r[1] > 1) refs.add(`${r[0]}:${r[1] - 1}`); refs.add(`${r[0]}:${r[1] + 1}`); } }
    // niet in de csv's (bv. spiegels zonder prijs): zoek de code zelf in de catalogustekst
    if (!refs.size) for (const v of vs.slice(0, 6)) for (const [c, pgs] of Object.entries(pag)) pgs.forEach((t, i) => { if (t.includes(v.code)) { refs.add(`${c}:${i + 1}`); if (i > 0) refs.add(`${c}:${i}`); } });
    if (!refs.size && !KORT) { console.log(`- ${p.name}: geen catalogus-pagina`); leeg++; return; }
    // alleen tabellen (accessoires)? dan de dichtstbijzijnde eerdere pagina met lopende tekst erbij (inleiding van de lijn)
    const proza = (t: string) => t.split("\n").filter((l) => l.trim().length >= 40 && /[.!?]$/.test(l.trim())).join(" ").length;
    const eigen = [...refs].reduce((a, r) => a + proza(pag[r.split(":")[0]][Number(r.split(":")[1]) - 1] ?? ""), 0);
    if (eigen < 500 && refs.size) { const [c, nr] = [...refs].sort()[0].split(":"); for (let k = 1; k <= 8; k++) { const t = pag[c][Number(nr) - 1 - k]; if (t && proza(t) > 600) { refs.add(`${c}:${Number(nr) - k}`); break; } } }
    const tekst = !refs.size ? "" : [...refs].sort().map((r) => { const [c, nr] = r.split(":"); return `--- ${c} pagina ${nr} ---\n${opschonen(pag[c][Number(nr) - 1] ?? "")}`; }).join("\n\n").slice(0, 14000);
    // de eigen artikelen (prijslijstnamen) erbij, zodat de uitleg alléén over dit product gaat en niet over een buurproduct op dezelfde pagina
    const plijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;
    const artikelen = [...new Set(vs.map((v) => plijst[v.code]?.naam).filter(Boolean))].slice(0, 12);
    const kop = artikelen.length ? `Dit product bestaat uit precies deze artikelen (beschrijf alleen wat hierop van toepassing is; andere producten of samenstellingen op dezelfde pagina laat je weg):\n${artikelen.map((e) => `- ${e}`).join("\n")}\n\n` : "";
    const o = refs.size ? await claude(p.name, p.category ?? "", kop + tekst) : null;
    if (!o?.nl && KORT) {
      const pl = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, Record<string, unknown>>;
      const regels = vs.map((v) => pl[v.code] ?? pl[v.code.toUpperCase()]).filter(Boolean).map((r) => `- ${r.naam} | materiaal: ${r.materiaal ?? "-"} | afwerking: ${r.afwerking ?? "-"} | kleur: ${r.kleur ?? "-"} | groep: ${r.groep ?? r.cat ?? "-"} | ${r.status ?? ""}`);
      const feiten = `Prijslijstregels van de uitvoeringen:\n${regels.slice(0, 40).join("\n")}\n\nOpties: ${JSON.stringify(p.optionAxes ?? [])}`;
      const o2 = await claude(p.name, p.category ?? "", `${feiten}\n\n(Er is geen catalogustekst; schrijf een korte, feitelijke uitleg van 2–3 zinnen plus hooguit één kopje met de kenmerken uit deze gegevens — materiaal, afwerking, beschikbare kleuren/maten. Niets verzinnen.)\n\n${tekst}`);
      if (o2?.nl) { await db.update(products).set({ description: o2.nl, descriptionI18n: o2 as never, updatedAt: new Date() }).where(eq(products.id, p.id)); n++; console.log(`✓ ${p.name} (kort, uit prijslijst)`); return; }
    }
    if (!o?.nl) { console.log(`- ${p.name}: niets bruikbaars (${[...refs].join(", ")})`); leeg++; return; }
    await db.update(products).set({ description: o.nl, descriptionI18n: o as never, updatedAt: new Date() }).where(eq(products.id, p.id));
    n++; console.log(`✓ ${p.name} (${[...refs].join(", ")}) — ${o.nl.split(/\s+/).length} woorden`);
  };
  await Promise.all([werk(), werk(), werk(), werk()]);
  console.log(`klaar: ${n} beschreven, ${leeg} zonder tekst`);
  process.exit(0);
}
main();
