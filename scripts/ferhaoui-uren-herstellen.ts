/**
 * Twee Ferhaoui-facturen op Gata de gorgos stonden geboekt als "1 uur" —
 * 24-08-2026.
 *
 * Wie de factuur koppelt en het urenveld leeg laat, kreeg tot vandaag één post
 * van het hele bedrag met dat bedrag als uurtarief: € 4.750 per uur. De kost op
 * het project klopte, de urenstand niet — 1 uur voor een maand werk.
 *
 * Ferhaoui factureert "trabajos realizados" zonder urenopgave (btw verlegd,
 * art. 84.UNO 2ª f), dus de uren worden teruggerekend met zijn tarief van € 28 —
 * dezelfde afleiding als bij zijn eerdere facturen op Roland Fierling. Het
 * bedrag blijft tot op de cent gelijk: het tarief krijgt zes decimalen zodat
 * uren × tarief exact het factuurbedrag is.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/ferhaoui-uren-herstellen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const TARIEF = 28;

const HERSTEL = [
  { po: "771e16e5-cb92-47ab-ac58-0ab0f2a7b522", ref: "0016/2026", bedrag: 4750 },
  { po: "fbb82a2c-a14d-40d7-abd3-fb73eb6d163a", ref: "0014/2026", bedrag: 3350 },
];

const eur = (n: number) => `€ ${n.toFixed(2)}`;

async function main() {
  const dry = process.argv.includes("--dry");

  const [arbeider] = (await pgClient`
    select id, name, hourly_cost_eur from workers where name ilike ${"%ferhaoui%"}
  `) as unknown as Array<{ id: string; name: string; hourly_cost_eur: string }>;
  if (!arbeider) throw new Error("Arbeider Ferhaoui niet gevonden — gestopt.");
  if (Number(arbeider.hourly_cost_eur) !== TARIEF) {
    throw new Error(`Tarief op de arbeiderskaart is ${arbeider.hourly_cost_eur}, script rekent met ${TARIEF} — gestopt.`);
  }

  await pgClient
    .begin(async (tx) => {
      for (const h of HERSTEL) {
        const regels = (await tx`
          select id, hours, hourly_cost_eur from time_entries
          where purchase_order_id = ${h.po} and self_logged_at is null
        `) as unknown as Array<{ id: string; hours: string; hourly_cost_eur: string }>;
        if (regels.length !== 1) {
          console.log(`${h.ref}: ${regels.length} urenregels — met de hand bekijken, overgeslagen`);
          continue;
        }
        const oud = regels[0];
        const oudeKost = Number(oud.hours) * Number(oud.hourly_cost_eur);
        if (Math.abs(oudeKost - h.bedrag) > 0.01) {
          throw new Error(`${h.ref}: geboekte kost ${eur(oudeKost)} ≠ factuur ${eur(h.bedrag)} — gestopt.`);
        }
        if (Number(oud.hours) !== 1) {
          console.log(`${h.ref}: staat al op ${oud.hours} uur — overgeslagen`);
          continue;
        }

        const uren = Math.round((h.bedrag / TARIEF) * 100) / 100;
        const tarief = h.bedrag / uren; // zes decimalen: kost blijft exact
        console.log(
          `${h.ref}: 1 u à ${eur(Number(oud.hourly_cost_eur))} → ${uren} u à ${tarief.toFixed(6)} = ${eur(uren * tarief)}`,
        );

        await tx`
          update time_entries set
            worker_id = ${arbeider.id},
            worker_name = ${arbeider.name},
            hours = ${uren.toFixed(2)},
            hourly_cost_eur = ${tarief.toFixed(6)},
            note = ${`Uren via inkoopfactuur ${h.ref} — uren afgeleid uit het tarief van ${arbeider.name} (€ ${TARIEF}/u); de factuur noemt alleen "trabajos realizados"`},
            updated_at = now()
          where id = ${oud.id}`;
      }

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${"Urenstand Ferhaoui op Gata de gorgos rechtgezet"},
        ${`Facturen ${HERSTEL.map((h) => h.ref).join(" en ")} stonden als één post van "1 uur" geboekt. De uren zijn teruggerekend met het tarief van € ${TARIEF}; de arbeidskost blijft ongewijzigd.`}
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
    const na = (await pgClient`
      select po.reference, pr.name as project, te.hours, te.hourly_cost_eur,
             round(te.hours * te.hourly_cost_eur, 2) as kost, te.worker_id is not null as op_naam
      from time_entries te
      join purchase_orders po on po.id = te.purchase_order_id
      left join projects pr on pr.id = te.project_id
      where te.purchase_order_id in ${pgClient(HERSTEL.map((h) => h.po))}`) as unknown as Array<Record<string, string>>;
    console.log("\nresultaat:");
    for (const r of na) {
      console.log(`  ${String(r.reference).padEnd(12)} ${String(r.project).padEnd(22)} ${Number(r.hours)} u × € ${Number(r.hourly_cost_eur).toFixed(6)} = ${eur(Number(r.kost))} · op naam=${r.op_naam}`);
    }
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
