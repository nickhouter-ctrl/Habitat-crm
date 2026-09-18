/**
 * Migraties toepassen — de enige weg naar productie (`npm run db:migrate`).
 *
 * Waarom een eigen script en niet `drizzle-kit migrate`: dat commando gebruikt
 * postgres.js zonder TLS, en Supabase dwingt TLS af. De verbinding valt dan weg
 * en drizzle-kit meldt dat NIET — het eindigt met "applying migrations…",
 * exitcode 0 en een database waarin niets is veranderd. Dat is de gevaarlijkste
 * soort fout: je denkt dat de migratie gelukt is. De migrator van drizzle-orm
 * doet hetzelfde werk (zelfde map, zelfde journaal, zelfde tabel
 * `drizzle.__drizzle_migrations`) maar gooit een fout die je ziet.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* bestaat niet — geen probleem */
  }
}

async function main() {
  // DIRECT_URL heeft voorrang: de transactiepooler (poort 6543) kan geen
  // advisory locks, de sessiepooler (5432) wel.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (of DIRECT_URL) ontbreekt — zie .env.example.");
  const host = url.replace(/\/\/[^@]*@/, "//***@");
  console.log(`Migraties toepassen op ${host}`);

  const client = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
  try {
    const voor = await client`select count(*)::int as n from drizzle.__drizzle_migrations`.catch(() => [{ n: 0 }]);
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const na = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    const nieuw = Number(na[0].n) - Number(voor[0].n);
    console.log(nieuw === 0 ? "Niets te doen: alles stond al toegepast." : `Klaar: ${nieuw} migratie(s) toegepast.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Migratie MISLUKT:", e);
  process.exit(1);
});
