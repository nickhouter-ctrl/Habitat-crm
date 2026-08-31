/**
 * De Obramat-bonnen achter factuur Pieter Hoogendijk 260064 afstemmen —
 * 31-08-2026.
 *
 * Zijn factuur van € 847,50 incl / € 700,41 ex dekt vier Obramat-facturen,
 * en op elke bon staat met de hand geschreven bij welke werf hij hoort:
 *
 *   029-0008-029478  25-08  € 514,54  "nr 1+3 Lizette, de rest Silvestre"
 *   029-0008-029449  25-08  €  37,35  "Huis Lizette"
 *   029-0008-031622  28-08  € 219,58  "nr 3+4 Lizette, de rest Silvestre"
 *   029-0008-023464  14-08  €  76,03  (briefje onleesbaar; stond op Villa Hans van Dalen)
 *                            ────────
 *                            € 847,50  = precies zijn factuur
 *
 * De regelbedragen ex btw volgen uit de TTI-kolom ÷ 1,21; de kolom "Total SI"
 * op deze bonnen is de stukprijs, niet het regeltotaal — daar zit de fout in
 * die er nu staat.
 *
 * Wat er nu geboekt is telt op tot € 686,63, dus € 13,78 minder dan de factuur.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/hoogendijk-260064-obramat.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const REFERENTIE = "Pieter Hoogendijk 260064";

/** Per werf: de som van de bonregels die er volgens de briefjes bij horen (ex btw). */
const VERDELING: { project: string; exBtw: number; toelichting: string }[] = [
  {
    project: "Finca Lisa",
    exBtw: 430.0,
    toelichting:
      "029478 regels 1+3 (€ 403,04 incl) + hele bon 029449 (€ 37,35 incl) + 031622 regels 3+4 (€ 79,90 incl)",
  },
  {
    project: "Silvestre",
    exBtw: 207.58,
    toelichting: "de overige regels van 029478 (€ 111,50 incl) en 031622 (€ 139,68 incl)",
  },
  {
    project: "Villa Hans van Dalen",
    exBtw: 62.83,
    toelichting: "hele bon 023464 van 14-08 (€ 76,03 incl) — briefje niet te lezen, staat zoals het stond",
  },
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");

  const [po] = (await pgClient`
    select id, reference, total::text, subtotal::text from purchase_orders where reference = ${REFERENTIE}
  `) as unknown as Array<{ id: string; reference: string; total: string; subtotal: string }>;
  if (!po) throw new Error(`Factuur "${REFERENTIE}" niet gevonden — gestopt.`);

  const som = Math.round(VERDELING.reduce((s, v) => s + v.exBtw, 0) * 100) / 100;
  if (som !== Number(po.subtotal)) {
    throw new Error(`De verdeling telt op tot ${eur(som)}, de factuur is ${eur(Number(po.subtotal))} ex btw — gestopt.`);
  }

  const huidig = (await pgClient`
    select pc.id, pr.name as project, pc.amount_eur::text
    from project_costs pc left join projects pr on pr.id = pc.project_id
    where pc.purchase_order_id = ${po.id}`) as unknown as Array<Record<string, string>>;
  const nu = Math.round(huidig.reduce((s, r) => s + Number(r.amount_eur), 0) * 100) / 100;

  console.log(`${po.reference} · ${eur(Number(po.total))} incl · ${eur(Number(po.subtotal))} ex btw\n`);
  for (const v of VERDELING) {
    const oud = huidig.find((h) => h.project === v.project);
    const verschil = v.exBtw - Number(oud?.amount_eur ?? 0);
    console.log(
      `  ${v.project.padEnd(22)} ${eur(Number(oud?.amount_eur ?? 0)).padStart(9)} → ${eur(v.exBtw).padStart(9)}  ${verschil === 0 ? "" : `(${verschil > 0 ? "+" : ""}${verschil.toFixed(2)})`}`,
    );
  }
  console.log(`  ${"".padEnd(22)} ${eur(nu).padStart(9)} → ${eur(som).padStart(9)}\n`);

  const onbekend = huidig.filter((h) => !VERDELING.some((v) => v.project === h.project));
  if (onbekend.length) {
    throw new Error(`Er staan kostenregels op werven die niet in de verdeling zitten (${onbekend.map((o) => o.project).join(", ")}) — met de hand bekijken.`);
  }

  await pgClient
    .begin(async (tx) => {
      for (const v of VERDELING) {
        const rij = huidig.find((h) => h.project === v.project);
        if (!rij) throw new Error(`Geen kostenregel voor ${v.project} — met de hand bekijken.`);
        await tx`
          update project_costs set
            amount_eur = ${v.exBtw.toFixed(2)},
            description = ${`Inkoopfactuur ${REFERENTIE} — ${v.toelichting}`},
            updated_at = now()
          where id = ${rij.id}`;
      }

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Verdeling ${REFERENTIE} afgestemd op de Obramat-bonnen`},
        ${`De vier Obramat-facturen achter deze rekening tellen samen op tot ${eur(Number(po.total))} incl btw — precies zijn factuur. Volgens de briefjes op de bonnen: ${VERDELING.map((v) => `${v.project} ${eur(v.exBtw)}`).join(", ")}. Er stond ${eur(nu)} geboekt, ${eur(Number(po.subtotal) - nu)} te weinig; de regelbedragen ex btw volgen uit de TTI-kolom ÷ 1,21, want "Total SI" op deze bonnen is de stukprijs en niet het regeltotaal.`}
      )`;

      if (dry) throw new Error("__DRY__");
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "__DRY__") {
        console.log("[DRY RUN] teruggedraaid — er is niets gewijzigd.");
        return;
      }
      throw e;
    });

  if (!dry) {
    const na = (await pgClient`
      select pr.name as project, pc.amount_eur::text
      from project_costs pc left join projects pr on pr.id = pc.project_id
      where pc.purchase_order_id = ${po.id} order by pc.amount_eur desc`) as unknown as Array<Record<string, string>>;
    console.log("resultaat:");
    let t = 0;
    for (const r of na) {
      t += Number(r.amount_eur);
      console.log(`  ${String(r.project).padEnd(22)} ${eur(Number(r.amount_eur)).padStart(9)}`);
    }
    console.log(`  ${"".padEnd(22)} ${eur(t).padStart(9)}  ${Math.abs(t - Number(po.subtotal)) < 0.01 ? "= de factuur ex btw" : "WIJKT AF"}`);
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
