/**
 * Eenmalig herstel van de migratie-boekhouding (drizzle.__drizzle_migrations),
 * onderdeel van het drift-herstel van 2026-08-06.
 *
 * Situatie vooraf: 31 rijen voor 41 journal-migraties. 0027–0036 zijn nooit
 * geregistreerd (wel structureel toegepast, via scripts/apply-*.ts of push);
 * 0038–0040 zijn geregistreerd met handmatig afgeronde timestamps die niet
 * matchen met drizzle/meta/_journal.json.
 *
 * Dit script (idempotent, in één transactie):
 *  1. zet de created_at van 0038–0040 op de journal-`when` (match op hash);
 *  2. voegt ontbrekende registraties t/m de journal toe — behálve de nog
 *     niet-toegepaste kop van de keten, zodat `npm run db:migrate` die zelf
 *     kan draaien en registreren.
 *
 * Het raakt uitsluitend de boekhoudtabel; er wordt geen schema-DDL uitgevoerd.
 *
 *   npx tsx scripts/repair-migration-tracking.ts
 */
import "./load-env";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { pgClient } from "../lib/db";

/** Migraties die migrate zelf nog moet toepassen — niet voorregistreren. */
const LAAT_VOOR_MIGRATE = new Set(["0041_low_edwin_jarvis"]);

async function main() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };
  const entries = journal.entries.map((e) => ({
    tag: e.tag,
    when: e.when,
    hash: createHash("sha256").update(readFileSync(`drizzle/${e.tag}.sql`, "utf8")).digest("hex"),
  }));

  await pgClient.begin(async (tx) => {
    for (const e of entries) {
      if (LAAT_VOOR_MIGRATE.has(e.tag)) continue;
      const upd = await tx`
        update drizzle.__drizzle_migrations set created_at = ${e.when}
        where hash = ${e.hash} and created_at <> ${e.when}`;
      if (upd.count) console.log(`timestamp gecorrigeerd: ${e.tag} → ${e.when}`);

      const exists = await tx`select 1 from drizzle.__drizzle_migrations where created_at = ${e.when}`;
      if (exists.length === 0) {
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${e.hash}, ${e.when})`;
        console.log(`geregistreerd: ${e.tag}`);
      }
    }
  });

  const [check] = (await pgClient`
    select count(*)::int as n, max(created_at) as laatste from drizzle.__drizzle_migrations
  `) as unknown as Array<{ n: number; laatste: string }>;
  console.log(`na herstel: ${check.n} rijen, laatste created_at = ${check.laatste}`);
  await pgClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
