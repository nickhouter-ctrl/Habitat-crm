# Migraties

`drizzle/` is sinds 2026-08-06 weer de **enige bron van waarheid** voor het
databaseschema. Daarvoor liepen er losse DDL-scripts naast de keten
(gearchiveerd in `scripts/migraties-historisch/`); migratie
`0041_low_edwin_jarvis.sql` is de idempotente inhaalslag die dat gat dicht.

## Workflow

```bash
# 1. wijzig lib/db/schema.ts
npm run db:generate    # nieuwe migratie in drizzle/
# 2. review de gegenereerde SQL (let op DROP/ALTER met dataverlies!)
npm run db:migrate     # toepassen + registreren in drizzle.__drizzle_migrations
```

Controle dat schema.ts, snapshot en database gelijklopen:
`npx tsx scripts/drift-inventory.ts`.

## Gebruik `db:push` NIET tegen productie

`drizzle-kit push` vergelijkt schema.ts direct met de database en **dropt**
alles wat het niet kent. In productie staan zes handmatige
`products_*_backup_*`-tabellen (snapshots van eerdere reparaties) die push
zou verwijderen. Migrate-only is de afspraak.

## RLS

Row Level Security staat AAN op alle publieke tabellen, **zonder policies**,
en dat is een bewuste keuze: het dicht uitsluitend de Supabase
PostgREST/anon-API af. Het CRM zelf verbindt als tabel-eigenaar (`postgres`)
en gaat langs RLS heen — autorisatie binnen de app zit volledig in
`lib/auth/guards.ts` en de `auth()`-checks. Nieuwe tabel toegevoegd? Draai
`npx tsx scripts/enable-rls.ts` (of neem `ENABLE ROW LEVEL SECURITY` op in de
migratie) en controleer met `scripts/check-rls.ts`.

## Losse feiten

- `0029_catalog_collection_category.sql` was een handgeschreven duplicaat dat
  nooit in de journal stond; op 2026-08-06 verwijderd.
- De tabellen `kv_cache` en `rate_limits` (raw SQL in `lib/kv-cache.ts` /
  `lib/rate-limit.ts`) staan sinds 0041 gewoon in `lib/db/schema.ts`.
- drizzle-kit gebruikt `DIRECT_URL` (session pooler, poort 5432) als die er
  is; de app zelf draait op de transaction pooler (6543).
