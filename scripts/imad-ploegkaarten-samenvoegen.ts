/**
 * De twee ploegkaarten van imad samenvoegen — 24-08-2026.
 *
 * imad stond er twee keer in: één kaart "per factuur" à € 24 en één "contant"
 * à € 20. Dat was de enige manier om twee tarieven te hebben, maar het splitste
 * zijn werk over twee kaarten — op geen van beide zag je wat hij écht gedaan
 * heeft (72 uur naast 2.332 uur).
 *
 * Sinds vandaag draagt één ploegkaart beide tarieven, dus kan het samen. De
 * kaart met het meeste werk blijft; het contante tarief van de andere gaat mee,
 * zijn urenregels en portaal-links worden omgehangen en de lege kaart gaat weg.
 *
 * De REEDS GEBOEKTE urenregels blijven ongemoeid: die dragen hun eigen tarief
 * als momentopname (€ 20 of € 24), en dat is wat er destijds is afgesproken.
 * Alleen toekomstige regels volgen de tarieven van de samengevoegde kaart.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/imad-ploegkaarten-samenvoegen.ts --dry
 */
import "./load-env";

import { pgClient } from "../lib/db";

const NAAM = "imad";

type Kaart = {
  id: string;
  name: string;
  role: string | null;
  hourly_cost_eur: string | null;
  hourly_cost_cash_eur: string | null;
  default_payment_method: "cash" | "invoice";
  portal_lang: string | null;
  notes: string | null;
  regels: number;
  uren: string;
};

async function main() {
  const dry = process.argv.includes("--dry");

  const kaarten = (await pgClient`
    select w.id, w.name, w.role, w.hourly_cost_eur::text, w.hourly_cost_cash_eur::text,
           w.default_payment_method, w.portal_lang, w.notes,
           (select count(*) from time_entries te where te.worker_id = w.id)::int as regels,
           coalesce((select sum(te.hours) from time_entries te where te.worker_id = w.id), 0)::text as uren
    from workers w
    where lower(trim(w.name)) = ${NAAM}
    order by (select count(*) from time_entries te where te.worker_id = w.id) desc
  `) as unknown as Kaart[];

  if (kaarten.length < 2) {
    console.log(`${kaarten.length} kaart(en) met de naam "${NAAM}" — niets samen te voegen.`);
    await pgClient.end();
    process.exit(0);
  }
  if (kaarten.length > 2) throw new Error(`${kaarten.length} kaarten gevonden — met de hand bekijken.`);

  const [blijft, weg] = kaarten;
  for (const k of kaarten) {
    console.log(
      `${k.id}  ${k.default_payment_method.padEnd(7)} factuur=${k.hourly_cost_eur ?? "—"} contant=${k.hourly_cost_cash_eur ?? "—"}  ${k.regels} regels / ${Number(k.uren)} uur`,
    );
  }

  // Welk tarief hoort bij welke betaalwijze? De kaart zegt zelf waarvoor hij
  // bedoeld was; dat is betrouwbaarder dan raden welk bedrag het hoogste is.
  const positief = (v: string | null) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const tariefVan = (k: Kaart, m: "cash" | "invoice") =>
    k.default_payment_method === m ? positief(k.hourly_cost_eur) : null;
  const factuur =
    tariefVan(blijft, "invoice") ?? tariefVan(weg, "invoice") ?? positief(blijft.hourly_cost_eur);
  const contant = tariefVan(blijft, "cash") ?? tariefVan(weg, "cash");
  if (!factuur && !contant) throw new Error("Geen enkel tarief gevonden — gestopt.");

  console.log(`\nblijft: ${blijft.id} → per factuur € ${factuur ?? "—"}, contant € ${contant ?? "—"}`);
  console.log(`weg:    ${weg.id} (${weg.regels} urenregels worden omgehangen)`);

  await pgClient
    .begin(async (tx) => {
      const uren = await tx`
        update time_entries set worker_id = ${blijft.id}, updated_at = now()
        where worker_id = ${weg.id} returning id`;

      // Portaal-links: één link per arbeider per project. Bestaat er voor dit
      // project al een link op de blijvende kaart, dan vervalt de dubbele.
      const links = await tx`
        update worker_portal_links l set worker_id = ${blijft.id}, updated_at = now()
        where l.worker_id = ${weg.id}
          and not exists (
            select 1 from worker_portal_links b
            where b.worker_id = ${blijft.id} and b.project_id = l.project_id
          )
        returning l.id`;
      const vervallen = await tx`delete from worker_portal_links where worker_id = ${weg.id} returning id`;

      await tx`
        update workers set
          hourly_cost_eur = ${factuur != null ? factuur.toFixed(6) : null},
          hourly_cost_cash_eur = ${contant != null ? contant.toFixed(6) : null},
          role = ${blijft.role ?? weg.role},
          notes = ${[blijft.notes, weg.notes].filter(Boolean).join("\n") || null},
          updated_at = now()
        where id = ${blijft.id}`;

      await tx`delete from workers where id = ${weg.id}`;

      await tx`insert into activities (type, subject, body) values (
        ${"note"},
        ${`Ploegkaarten van ${blijft.name} samengevoegd`},
        ${`Twee kaarten met dezelfde naam (één contant, één per factuur) zijn er één geworden met beide tarieven: € ${factuur ?? "—"} per factuur en € ${contant ?? "—"} contant. ${uren.length} urenregels en ${links.length} portaal-links omgehangen${vervallen.length ? `, ${vervallen.length} dubbele portaal-link vervallen` : ""}. Bestaande urenregels houden het tarief waarmee ze geboekt zijn.`}
      )`;

      console.log(`\n${uren.length} urenregels omgehangen, ${links.length} portaal-links mee, ${vervallen.length} dubbel vervallen`);
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
      select w.id, w.name, w.hourly_cost_eur::text, w.hourly_cost_cash_eur::text,
             (select count(*) from time_entries te where te.worker_id = w.id)::int as regels,
             coalesce((select sum(te.hours) from time_entries te where te.worker_id = w.id), 0)::text as uren
      from workers w where lower(trim(w.name)) = ${NAAM}`) as unknown as Kaart[];
    console.log("\nresultaat:");
    for (const k of na) {
      console.log(`  ${k.name}: € ${k.hourly_cost_eur} per factuur, € ${k.hourly_cost_cash_eur} contant — ${k.regels} regels / ${Number(k.uren)} uur`);
    }
  }
  await pgClient.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
