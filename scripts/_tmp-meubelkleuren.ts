/** Kleurnamen van meubeluitvoeringen uit de officiële prijslijst (Kleur + Afwerking); onbekende "?XX" benoemen en activeren; assen herbouwen. */
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
const TOEPASSEN = process.argv.includes("--toepassen");
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { bron: string; kleur?: string | null; afwerking?: string | null }>;
const LABEL: Record<string, string> = { kleur: "Kleur", breedte: "Breedte", maat: "Maat", vorm: "Vorm", uitvoering: "Uitvoering", lades: "Lades", uitsparingen: "Sifonuitsparingen", positie: "Positie", wasbakken: "Wasbakken", kraangat: "Kraangat" };

/** Excel (Kleur, Afwerking, code) → naam zoals het CRM ze schrijft. */
function naam(code: string, kleur: string, afw: string | null): string | null {
  const delen = kleur.split(",").map((k) => k.trim()).filter(Boolean); const afws = (afw ?? "").split(",").map((a) => a.trim());
  const een = (k: string, a: string): string => {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (/^Eiken /i.test(k)) { const t = k.replace(/^Eiken /i, ""); return (/VEG/.test(code) ? "Vingerlas Eiken " : "Lamellen Eiken ") + cap(t); }
    const basis = ["Wit", "Zwart", "Zand", "Beige", "Grijs", "Mokka", "Taupe"];
    if (a === "Mat" && basis.includes(k)) return k === "Zwart" ? "Mat zwart" : `Mat ${k}`;
    if (a === "Hoogglans" && k === "Wit") return "Hoogglans Wit";
    if (a === "Zijdeglans" && k === "Wit") return "Zijdeglans Wit";
    if (a === "Geborsteld") return { Goud: "Geborsteld goud", Koper: "Geborsteld koper", Gunmetal: "Geborsteld gunmetal", "RVS-kleurig": "Geborsteld RVS", "Aluminium-kleurig": "Geborsteld aluminium", Zwart: "Geborsteld zwart" }[k] ?? `Geborsteld ${k.toLowerCase()}`;
    if (k === "Nero Marquina") return "Basalt Nero Marquina";
    if (k === "Grijs" && /ALU$/.test(code)) return "Aluminium";
    if (k === "Zwart") return "Mat zwart";
    if (k === "Wit") return "Wit";
    if (k === "Goud" || k === "Koper" || k === "Gunmetal") return `Geborsteld ${k.toLowerCase()}`;
    if (k === "RVS-kleurig") return "Geborsteld RVS";
    return k;
  };
  if (!delen.length) return null;
  return delen.map((k, i) => een(k, afws[i] ?? afws[0] ?? "")).join(" / ");
}

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = (await db.select().from(products).where(eq(products.brandId, merk.id))).filter((p) => ["Badkamermeubels", "Spiegels", "Spiegelkasten", "Accessoires"].includes(p.category ?? ""));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const vars = (await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id))).filter((v) => pm.has(v.productId));
  const wijzig: { v: typeof vars[number]; naam: string }[] = []; const telling = new Map<string, number>(); let geenRegel = 0, aan = 0;
  for (const v of vars) {
    const sleutel = v.code.replace(/^2[xX]OK-/, "OK-");
    const r = lijst[sleutel] ?? lijst[v.code]; if (!r || r.bron !== "meubel" || !r.kleur) { geenRegel++; continue; }
    const n = naam(v.code, String(r.kleur), r.afwerking ? String(r.afwerking) : null); if (!n) continue;
    if (/VEG$/.test(v.code) && n === "Mat Zand") continue; // prijslijstfoutje: vingerlas-code met kleur "Zand"
    const huidig = (v.options as Record<string, string> | null)?.kleur ?? "";
    if (huidig !== n) { wijzig.push({ v, naam: n }); telling.set(`${huidig || "(leeg)"} → ${n}`, (telling.get(`${huidig || "(leeg)"} → ${n}`) ?? 0) + 1); if (!v.isActive) aan++; }
  }
  console.log(`${vars.length} meubeluitvoeringen; ${wijzig.length} kleurnamen wijzigen (waarvan ${aan} activeren); ${geenRegel} zonder prijslijstregel`);
  for (const [k, n] of [...telling.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${n}× ${k}`);
  if (!TOEPASSEN) process.exit(0);
  const geraakt = new Set<string>();
  for (const { v, naam: n } of wijzig) { await db.update(productVariants).set({ options: { ...(v.options ?? {}), kleur: n } as never, isActive: true, updatedAt: new Date() }).where(eq(productVariants.id, v.id)); geraakt.add(v.productId); }
  for (const pid of geraakt) {
    const p = pm.get(pid)!; const vs = await db.select().from(productVariants).where(eq(productVariants.productId, pid));
    const oud = (p.optionAxes ?? []) as ProductOptionAxis[];
    const keys = [...new Set(vs.flatMap((x) => Object.keys((x.options ?? {}) as object)))];
    const assen: ProductOptionAxis[] = keys.map((k) => { const oa = oud.find((a) => a.key === k); const w = [...new Set(vs.filter((x) => x.isActive).map((x) => (x.options as Record<string, string>)?.[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })); return { key: k, label: oa?.label ?? LABEL[k] ?? k, values: w.map((val) => ({ value: val, label: val, imageUrl: oa?.values.find((y) => y.value === val)?.imageUrl })) }; }).filter((a) => a.values.length > 1 || a.key === "kleur");
    for (const x of vs) await db.update(productVariants).set({ label: buildVariantLabel(assen, (x.options ?? {}) as Record<string, string>) || x.code }).where(eq(productVariants.id, x.id));
    await db.update(products).set({ optionAxes: assen, updatedAt: new Date() }).where(eq(products.id, pid));
    await syncVariantProjection(pid);
  }
  console.log(`gedaan: ${geraakt.size} producten herbouwd`);
  process.exit(0);
}
main();
