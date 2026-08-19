/**
 * Ruimt het dubbel geregistreerde containerpapier op — 19-08-2026.
 *
 * Elke China-verzending staat formeel in Holded als goederenfactuur + aparte
 * 15%-handlingfactuur (ALLPACK ENTERPRISES LTD, gekoppeld via holded_id).
 * Daarnaast zijn dezelfde verzendingen nogmaals — soms drie keer — informeel
 * ingeboekt vanuit de mailbijlagen (CI/PI/packing lists, veelal in USD,
 * leveranciers "Allpack (CN agent)", Foshan, KKR, Yohome, Hebei). Die losse
 * registraties zijn geen echte openstaande schuld: de boekhouding zit in
 * Holded. Zelfde regel als bij de opruimactie van 13-08: **de versie die in
 * Holded staat blijft**; bijlagen, mails en keurregels worden eerst naar de
 * blijver omgehangen (bijlagen als samenvoeging — geen bronbestand verloren).
 *
 * Drie paren zonder Holded-tegenhanger zijn onderling exact dubbel (zelfde
 * bedrag, zelfde verzending): daar blijft de nieuwste/rijkste versie staan.
 *
 * Veiligheid: een te verwijderen regel mag geen holded_id hebben en geen
 * orderregels met productkoppeling (dan zou voorraad los komen te hangen) —
 * anders stopt het script zonder iets te wijzigen. Dry-run met --dry.
 *
 *   npx tsx scripts/opruimen-containerpapier-19-08.ts --dry
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

type Paar = { weg: string; houd: string; wat: string };

const PAREN: Paar[] = [
  // TSC-EX266015 — formeel: ALLPACK € 50.076,66 + 15% € 7.511,50 (Holded)
  { weg: "127d34f9", houd: "690c7799", wat: "TSC-EX266015: losse CI (USD € 69.861) — Holded-boeking blijft" },
  { weg: "8a0aa1d3", houd: "690c7799", wat: "TSC-EX266015: tweede losse CI (zelfde bedrag)" },
  { weg: "dde7d270", houd: "9f4edc7e", wat: "TSC-EX266015: losse handling-CI — Holded 15%-factuur blijft" },
  // HANH00260307001 — formeel: € 34.883,87 + 15% € 5.232,57 (Holded)
  { weg: "716ac859", houd: "124571f3", wat: "HANH00260307001: losse handling-CI (3× identiek ingeboekt) 1/3" },
  { weg: "05a6ef69", houd: "124571f3", wat: "HANH00260307001: losse handling-CI 2/3" },
  { weg: "863c8d1e", houd: "124571f3", wat: "HANH00260307001: losse handling-CI 3/3" },
  // HANH0026001260306 — formeel: € 15.108,12 + 15% € 1.098,77 (Holded)
  { weg: "610352b8", houd: "c007f578", wat: "HANH0026001260306: losse handling-CI (USD) — Holded 15% blijft" },
  // HANH002604010001 — formeel: Holded-doc aan de € 16-regel (totaal wordt apart hersteld)
  { weg: "e791089f", houd: "3f7d42b9", wat: "HANH002604010001: losse handling-CI — Holded-boeking blijft" },
  // PJ0034976 — formeel: € 23.825,36 + 15% € 3.573,41 (Holded, betaald)
  { weg: "2c12946c", houd: "6ef9b472", wat: "PJ0034976: losse handling-CI — Holded 15% blijft" },
  // 12#kkr20260310 — formeel: € 1.924,03 + 15% € 288,60 (Holded, betaald)
  { weg: "b1de7d82", houd: "449a93eb", wat: "12#kkr: losse handling-CI" },
  { weg: "b56fdffe", houd: "0183858d", wat: "12#kkr: losse CI € 6" },
  { weg: "7e4b6a9a", houd: "0183858d", wat: "12#kkr: losse PI € 6 (zelfde als de CI)" },
  // 14#kkr20260313 — formeel: € 1.467,23 + 15% € 220,09 (Holded, betaald)
  { weg: "94ea61f4", houd: "2fe2aa34", wat: "14#kkr: losse handling-CI" },
  { weg: "9ade089d", houd: "6b7a7fb0", wat: "14#kkr: losse CI € 20" },
  { weg: "6831b5e5", houd: "6b7a7fb0", wat: "14#kkr: losse PI € 10" },
  // HN-K-20251208 — formeel: € 19.188,25 + 15% € 2.832,62 (Holded, betaald)
  { weg: "edcafd3b", houd: "e1a82063", wat: "HN-K-20251208: losse PI (2× identiek) 1/2" },
  { weg: "310b5bef", houd: "e1a82063", wat: "HN-K-20251208: losse PI 2/2" },
  // 2025EL173 — formeel: € 9.735,88 + € 1.465,96 (Holded)
  { weg: "86376066", houd: "d1381c5e", wat: "2025EL173: losse handling-invoice (USD) — Holded blijft" },
  { weg: "1fa49c48", houd: "97f27f15", wat: "2025EL173: losse € 51-registratie (invoice) 1/3" },
  { weg: "c13083b0", houd: "97f27f15", wat: "2025EL173: losse € 51-registratie (PI) 2/3" },
  { weg: "b8ab6af2", houd: "97f27f15", wat: "2025EL173: losse € 51-registratie (packing list) 3/3" },
  // Onderling exact dubbel, geen Holded-tegenhanger — nieuwste/rijkste blijft
  { weg: "cbe0163c", houd: "081cd235", wat: "Forklifts CI-20251103C: 12.16-versie weg, de 'updated' 12.17 blijft" },
  { weg: "78927120", houd: "55c200e6", wat: "Backlit letters: PI weg, de CI (zelfde bedrag/datum) blijft" },
  { weg: "b692a05b", houd: "0c36d516", wat: "Hebei backing board: oude PI weg, de verlaagde-prijs-versie blijft" },
];

type Po = {
  id: string; supplier: string; reference: string | null; total: string;
  holded_id: string | null; attachments: unknown; items: unknown;
};

async function main() {
  const dry = process.argv.includes("--dry");
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!);
  let opgeruimd = 0;
  let somWeg = 0;

  await sql
    .begin(async (tx) => {
      for (const p of PAREN) {
        const wegRows = (await tx`select id, supplier, reference, total, holded_id, attachments, items
          from purchase_orders where id::text like ${p.weg + "%"}`) as unknown as Po[];
        const houdRows = (await tx`select id, supplier, reference, total, holded_id, attachments, items
          from purchase_orders where id::text like ${p.houd + "%"}`) as unknown as Po[];
        const weg = wegRows[0];
        const houd = houdRows[0];
        if (!weg) { console.log(`(al opgeruimd) ${p.wat}`); continue; }
        if (wegRows.length > 1 || houdRows.length > 1) throw new Error(`Id-prefix niet uniek voor ${p.wat} — gestopt.`);
        if (!houd) throw new Error(`Blijver ontbreekt voor ${p.wat} — gestopt, niets verwijderd.`);
        if (weg.holded_id) throw new Error(`${p.wat}: te verwijderen regel staat in Holded (${weg.holded_id}) — gestopt.`);
        const items = Array.isArray(weg.items) ? (weg.items as { productId?: string }[]) : [];
        if (items.some((i) => i.productId)) {
          throw new Error(`${p.wat}: orderregel met productkoppeling — voorraadrisico, gestopt.`);
        }

        console.log(p.wat);
        console.log(`   WEG:  "${weg.reference}" € ${weg.total}`);
        console.log(`   HOUD: "${houd.reference}" € ${houd.total}${houd.holded_id ? " (in Holded)" : ""}`);

        const mails = await tx`update email_inbox set linked_purchase_order_id = ${houd.id}, updated_at = now()
          where linked_purchase_order_id = ${weg.id} returning id`;
        if (mails.length) console.log(`   ${mails.length} mail(s) omgehangen`);

        const keur = await tx`update purchase_invoice_reviews set purchase_order_id = ${houd.id}, updated_at = now()
          where purchase_order_id = ${weg.id} returning id`;
        if (keur.length) console.log(`   ${keur.length} keurregel(s) omgehangen`);
        await tx`update purchase_invoice_reviews set duplicate_of_po_id = ${houd.id} where duplicate_of_po_id = ${weg.id}`;

        // Bijlagen samenvoegen op de blijver — geen bronbestand verloren.
        const wegB = Array.isArray(weg.attachments) ? (weg.attachments as unknown[]) : [];
        const houdB = Array.isArray(houd.attachments) ? (houd.attachments as unknown[]) : [];
        if (wegB.length > 0) {
          const seen = new Set(houdB.map((b) => JSON.stringify(b)));
          const merged = [...houdB, ...wegB.filter((b) => !seen.has(JSON.stringify(b)))];
          if (merged.length > houdB.length) {
            await tx`update purchase_orders set attachments = ${JSON.stringify(merged)}::jsonb, updated_at = now() where id = ${houd.id}`;
            console.log(`   ${merged.length - houdB.length} bijlage(n) samengevoegd op de blijver`);
          }
        }

        await tx`insert into activities (type, subject, body) values (
          ${"note"},
          ${`Dubbel containerpapier opgeruimd: ${weg.supplier} ${weg.reference ?? ""}`.trim()},
          ${`Verwijderd als losse registratie van dezelfde verzending als "${houd.reference}" (€ ${weg.total}).\n${p.wat}`}
        )`;

        await tx`delete from purchase_orders where id = ${weg.id}`;
        console.log("   verwijderd\n");
        opgeruimd++;
        somWeg += Number(weg.total);
      }
      if (dry) throw new Error("__DRY__");
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "__DRY__") {
        console.log("[DRY RUN] transactie teruggedraaid — er is niets gewijzigd.");
        return;
      }
      throw e;
    });

  console.log(`${opgeruimd} losse registraties opgeruimd, samen € ${somWeg.toFixed(2)} aan schijn-openstaand.`);
  const [n] = await sql`select count(*)::int n, coalesce(sum(total),0) t from purchase_orders where paid_at is null`;
  console.log(`Nog onbetaald: ${n.n} regels, samen € ${Number(n.t).toFixed(2)}.`);
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
