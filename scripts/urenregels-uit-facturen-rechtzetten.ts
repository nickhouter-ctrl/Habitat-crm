/**
 * Urenregels die uit een inkoopfactuur komen rechtzetten — 24-08-2026.
 *
 * Twee dingen gingen mis bij het goedkeuren van een inkoopfactuur:
 *
 * 1. BETAALWIJZE. De urenregel kreeg geen betaalwijze mee, en de kolom valt
 *    terug op 'contant'. Daardoor stond € 45.322 aan arbeid als contant betaald
 *    geboekt terwijl het allemaal per factuur ging — er wordt al een tijd niet
 *    meer contant aan de ploeg betaald. Een regel die aan een factuur hangt IS
 *    per factuur betaald; dat is geen aanname.
 *
 * 2. BTW. Bij een verdeling over werven werden de ingevulde bedragen
 *    overgenomen zoals ze waren. Bij Wilhelmus 0-05 telden die op tot het
 *    totaal INCLUSIEF btw (€ 1.061,78) in plaats van het bedrag ex btw
 *    (€ 877,50) — 21% te veel arbeidskost op drie werven. Btw is geen kostprijs.
 *
 * Alleen het onmiskenbare geval wordt teruggeschaald: de geboekte kost is exact
 * het totaal incl. btw terwijl er een lager bedrag ex btw bekend is. Facturen
 * waar de kost om een andere reden afwijkt blijven staan — daar valt niet uit de
 * cijfers af te leiden wat de bedoeling was.
 *
 * Portaal-uren (self_logged_at) blijven ongemoeid: die vult de arbeider zelf in.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/urenregels-uit-facturen-rechtzetten.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const eur = (n: number) => `€ ${n.toFixed(2)}`;

type Scheef = {
  id: string;
  reference: string | null;
  ex_btw: string;
  total: string;
  geboekt: string;
  uren: string;
};

async function main() {
  const dry = process.argv.includes("--dry");

  // ── 1. betaalwijze ────────────────────────────────────────────────────────
  const teWijzigen = (await pgClient`
    select te.id, po.reference, te.hours::text, round(te.hours*te.hourly_cost_eur,2)::text as kost
    from time_entries te join purchase_orders po on po.id = te.purchase_order_id
    where te.payment_method = 'cash' and te.self_logged_at is null`) as unknown as Array<Record<string, string>>;
  const somCash = teWijzigen.reduce((s, r) => s + Number(r.kost), 0);
  console.log(`betaalwijze: ${teWijzigen.length} urenregels uit een factuur staan op contant (${eur(somCash)})`);

  // ── 2. incl. btw geboekt ──────────────────────────────────────────────────
  const scheef = (await pgClient`
    select po.id, po.reference,
           coalesce(nullif(po.subtotal,0),
                    case when coalesce(po.tax,0) <> 0 then round(po.total-po.tax,2) else po.total end, 0)::text as ex_btw,
           po.total::text,
           round(sum(te.hours*te.hourly_cost_eur),2)::text as geboekt,
           sum(te.hours)::text as uren
    from purchase_orders po join time_entries te on te.purchase_order_id = po.id
    where te.self_logged_at is null
    group by po.id, po.reference, po.subtotal, po.tax, po.total
    having abs(round(sum(te.hours*te.hourly_cost_eur),2) - po.total) < 0.02
       and coalesce(nullif(po.subtotal,0),
                    case when coalesce(po.tax,0) <> 0 then round(po.total-po.tax,2) else po.total end, 0) < po.total - 0.02
  `) as unknown as Scheef[];

  console.log(`btw: ${scheef.length} factu(u)r(en) met de arbeidskost op het bedrag INCLUSIEF btw`);
  for (const f of scheef) {
    console.log(
      `  ${String(f.reference).padEnd(30)} ${Number(f.uren)} u · ${eur(Number(f.geboekt))} → ${eur(Number(f.ex_btw))} (${eur(Number(f.geboekt) / Number(f.uren))}/u → ${eur(Number(f.ex_btw) / Number(f.uren))}/u)`,
    );
  }

  if (teWijzigen.length === 0 && scheef.length === 0) {
    console.log("\nNiets recht te zetten.");
    await pgClient.end();
    process.exit(0);
  }

  await pgClient
    .begin(async (tx) => {
      if (teWijzigen.length > 0) {
        await tx`
          update time_entries te set payment_method = 'invoice', updated_at = now()
          from purchase_orders po
          where po.id = te.purchase_order_id
            and te.payment_method = 'cash' and te.self_logged_at is null`;
      }

      for (const f of scheef) {
        // Verhouding tussen de delen blijft; alleen de schaal gaat naar ex btw.
        const factor = Number(f.ex_btw) / Number(f.geboekt);
        await tx`
          update time_entries set
            hourly_cost_eur = round(hourly_cost_eur * ${factor}, 6),
            updated_at = now()
          where purchase_order_id = ${f.id} and self_logged_at is null`;
      }

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Urenregels uit inkoopfacturen rechtgezet"},
        ${
          `${teWijzigen.length} urenregels stonden op "contant" terwijl ze uit een factuur komen (${eur(somCash)}) — nu per factuur. ` +
          (scheef.length
            ? `Daarnaast stond bij ${scheef.map((f) => f.reference).join(", ")} de arbeidskost op het bedrag inclusief btw; teruggeschaald naar ex btw (${scheef.map((f) => `${eur(Number(f.geboekt))} → ${eur(Number(f.ex_btw))}`).join(", ")}).`
            : "")
        }
      )`;

      if (dry) throw new Error("__DRY__");
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "__DRY__") {
        console.log("\n[DRY RUN] teruggedraaid — er is niets gewijzigd.");
        return;
      }
      throw e;
    });

  if (!dry) {
    console.log("\nresultaat:");
    console.table(
      await pgClient`
        select te.payment_method, count(*)::int n, round(sum(te.hours*te.hourly_cost_eur),2)::text kost
        from time_entries te where te.purchase_order_id is not null group by te.payment_method`,
    );
    const rest = (await pgClient`
      select po.reference,
             coalesce(nullif(po.subtotal,0),
                      case when coalesce(po.tax,0) <> 0 then round(po.total-po.tax,2) else po.total end, 0)::text as ex_btw,
             round(sum(te.hours*te.hourly_cost_eur),2)::text as geboekt
      from purchase_orders po join time_entries te on te.purchase_order_id = po.id
      where te.self_logged_at is null
      group by po.id, po.reference, po.subtotal, po.tax
      having abs(round(sum(te.hours*te.hourly_cost_eur),2)
             - coalesce(nullif(po.subtotal,0),
                        case when coalesce(po.tax,0) <> 0 then round(po.total-po.tax,2) else po.total end, 0)) > 0.02
    `) as unknown as Array<Record<string, string>>;
    if (rest.length) {
      console.log("\nnog met de hand te bekijken — kost wijkt af van de factuur, maar niet met een btw-verhouding:");
      for (const r of rest) {
        console.log(`  ${String(r.reference).padEnd(30)} factuur ${eur(Number(r.ex_btw))} ex btw · geboekt ${eur(Number(r.geboekt))}`);
      }
    }
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
