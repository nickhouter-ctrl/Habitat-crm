/**
 * Eenmalig (13-11-2026): de met de hand gemaakte Zernio-concepten in de
 * social-reviewpagina zetten, zodat ze daar gecontroleerd en goedgekeurd
 * worden. Per post bestaan in Zernio twee losse concepten (IG en FB); het
 * CRM werkt met één Zernio-post voor beide platforms. We koppelen daarom het
 * IG-concept (dat bij akkoord ook naar FB gaat) en verwijderen het FB-concept.
 *
 * Caption en media komen uit een JSON-export van de concepten ({igId: {content, urls}}),
 * zodat er lokaal geen Zernio-sleutel nodig is; de FB-concepten worden daarna
 * apart verwijderd.
 *
 *   npx tsx scripts/import-zernio-drafts.ts <export.json>          (dry run)
 *   npx tsx scripts/import-zernio-drafts.ts <export.json> --apply
 */
import "./load-env";
import { eq } from "drizzle-orm";

import { db } from "../lib/db";
import { socialPosts } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
import fs from "node:fs";
const EXPORT = process.argv.slice(2).find((a) => !a.startsWith("--"));
const IG = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID ?? "6af6d36076ba618ebc0eb2e5";
const FB = process.env.ZERNIO_FACEBOOK_ACCOUNT_ID ?? "6af6d49dd64fa3050c9ec9d6";

interface Plan {
  date: string;
  weekStart: string;
  slot: number;
  theme: string;
  kind: "carousel" | "single" | "video";
  ig: string;
  fb: string;
  status?: "published";
}

const PLAN: Plan[] = [
  // Al live op 13-11 (alleen ter registratie, niets in Zernio wijzigen).
  { date: "2026-11-13", weekStart: "2026-11-09", slot: 2, theme: "outdoor", kind: "carousel", ig: "6af7364c952c8688475e0ffd", fb: "6af73652ed5ed2b07325a006", status: "published" },
  { date: "2026-11-16", weekStart: "2026-11-16", slot: 0, theme: "interior", kind: "carousel", ig: "6af7365d952c8688475e1033", fb: "6af7366044d9498141454302" },
  { date: "2026-11-18", weekStart: "2026-11-16", slot: 1, theme: "curved", kind: "video", ig: "6af72c13a37390460e2d8d33", fb: "6af72c17f881870df8c193bc" },
  { date: "2026-11-20", weekStart: "2026-11-16", slot: 2, theme: "outdoor", kind: "carousel", ig: "6af7367044d94981414545a8", fb: "6af73675952c8688475e1099" },
  { date: "2026-11-23", weekStart: "2026-11-23", slot: 0, theme: "outdoor", kind: "single", ig: "6af7367ced5ed2b07325a0d6", fb: "6af7367e952c8688475e10c4" },
  { date: "2026-11-25", weekStart: "2026-11-23", slot: 1, theme: "outdoor", kind: "single", ig: "6af73683ed5ed2b07325a10b", fb: "6af73686ed5ed2b07325a136" },
];

async function main() {
  if (!EXPORT) throw new Error("Geef het pad naar de JSON-export mee.");
  const exp = JSON.parse(fs.readFileSync(EXPORT, "utf8")) as Record<string, { content: string; urls: string[] }>;
  for (const p of PLAN) {
    const src = exp[p.ig];
    if (!src) throw new Error(`Concept ${p.ig} ontbreekt in de export.`);
    const caption = src.content.trim();
    const urls = src.urls;
    const [existing] = await db.select({ id: socialPosts.id }).from(socialPosts).where(eq(socialPosts.plannedDate, p.date)).limit(1);
    console.log(`${p.date} ${p.kind} ${urls.length} media — ${caption.slice(0, 50).replace(/\n/g, " ")}${existing ? "  (bestaat al, overgeslagen)" : ""}`);
    if (!APPLY || existing) continue;
    await db.insert(socialPosts).values({
      weekStart: p.weekStart,
      plannedDate: p.date,
      publishTime: "08:00",
      slot: p.slot,
      theme: p.theme,
      kind: p.kind,
      caption,
      videoUrl: p.kind === "video" ? (urls[0] ?? null) : null,
      aiGenerated: p.kind === "video",
      status: p.status ?? "draft",
      zernioPostId: p.ig,
      zernioMediaUrls: urls,
      zernioAccounts: { instagram: IG, facebook: FB },
      publishedAt: p.status ? new Date("2026-11-13T17:30:00Z") : null,
    });
  }
  console.log(APPLY ? "Klaar." : "Dry run — draai met --apply om te importeren.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
