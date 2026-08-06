/**
 * Drift-inventarisatie: vergelijk (1) de echte database, (2) lib/db/schema.ts
 * en (3) de laatste drizzle-snapshot met elkaar. Alleen SELECT-queries.
 *
 *   npx tsx scripts/drift-inventory.ts
 */
import "./load-env";

import { readFileSync, readdirSync } from "node:fs";

import { toSnakeCase } from "drizzle-orm/casing";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import { pgClient } from "../lib/db";
import * as schema from "../lib/db/schema";

async function main() {
  // 1. schema.ts → { tabel: Set<kolom> }
  const schemaTables = new Map<string, Set<string>>();
  for (const v of Object.values(schema)) {
    if (!(v instanceof PgTable)) continue;
    const cfg = getTableConfig(v);
    const cols = new Set<string>();
    for (const c of cfg.columns) {
      // Zelfde casing als de runtime (drizzle client draait met casing: "snake_case").
      cols.add((c as unknown as { keyAsName?: boolean }).keyAsName ? toSnakeCase(c.name) : c.name);
    }
    schemaTables.set(cfg.name, cols);
  }

  // 2. Echte DB → { tabel: Set<kolom> }
  const dbCols = (await pgClient`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' order by table_name, ordinal_position
  `) as unknown as Array<{ table_name: string; column_name: string }>;
  const dbTables = new Map<string, Set<string>>();
  for (const r of dbCols) {
    if (!dbTables.has(r.table_name)) dbTables.set(r.table_name, new Set());
    dbTables.get(r.table_name)!.add(r.column_name);
  }

  // 3. Laatste snapshot → { tabel: Set<kolom> }
  const snaps = readdirSync("drizzle/meta").filter((f) => f.endsWith("_snapshot.json")).sort();
  const snapFile = `drizzle/meta/${snaps[snaps.length - 1]}`;
  const snap = JSON.parse(readFileSync(snapFile, "utf8"));
  const snapTables = new Map<string, Set<string>>();
  for (const t of Object.values(snap.tables ?? {}) as Array<{ name: string; columns: Record<string, { name: string }> }>) {
    snapTables.set(t.name, new Set(Object.values(t.columns).map((c) => c.name)));
  }

  const diffKeys = (a: Map<string, Set<string>>, b: Map<string, Set<string>>) =>
    [...a.keys()].filter((k) => !b.has(k)).sort();

  console.log(`Snapshot: ${snapFile}`);
  console.log(`Aantallen — DB: ${dbTables.size} | schema.ts: ${schemaTables.size} | snapshot: ${snapTables.size}`);
  console.log("\nTabellen in DB maar niet in schema.ts:", diffKeys(dbTables, schemaTables));
  console.log("Tabellen in schema.ts maar niet in DB:", diffKeys(schemaTables, dbTables));
  console.log("Tabellen in schema.ts maar niet in snapshot:", diffKeys(schemaTables, snapTables));
  console.log("Tabellen in snapshot maar niet in schema.ts:", diffKeys(snapTables, schemaTables));

  console.log("\nKolomverschillen DB vs schema.ts (gemeenschappelijke tabellen):");
  let colDiffs = 0;
  for (const [t, dbSet] of [...dbTables].sort()) {
    const sSet = schemaTables.get(t);
    if (!sSet) continue;
    const onlyDb = [...dbSet].filter((c) => !sSet.has(c));
    const onlySchema = [...sSet].filter((c) => !dbSet.has(c));
    if (onlyDb.length) { console.log(`  ${t} — alleen in DB: ${onlyDb.join(", ")}`); colDiffs++; }
    if (onlySchema.length) { console.log(`  ${t} — alleen in schema.ts: ${onlySchema.join(", ")}`); colDiffs++; }
  }
  if (!colDiffs) console.log("  (geen)");

  const migTracking = (await pgClient`
    select n.nspname as schema, c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and (c.relname like '%drizzle%' or c.relname like '%migration%')
  `) as unknown as Array<{ schema: string; name: string }>;
  console.log("\nMigratie-tracking-tabellen:", JSON.stringify(migTracking));
  for (const m of migTracking) {
    if (!m.name.includes("drizzle")) continue;
    const rows = (await pgClient`
      select id, hash, created_at from ${pgClient(m.schema)}.${pgClient(m.name)} order by created_at
    `) as unknown as Array<{ id: number; hash: string; created_at: string }>;
    console.log(`${m.schema}.${m.name}: ${rows.length} rijen; laatste 3:`);
    for (const r of rows.slice(-3)) console.log(`  ${r.id} ${String(r.created_at)} ${String(r.hash).slice(0, 12)}…`);
  }

  await pgClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
