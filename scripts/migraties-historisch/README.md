# Historische migratie-scripts — NIET meer draaien

Deze scripts waren een tweede migratiepad naast `drizzle/`: losse DDL-wijzigingen
(`apply-*.ts`, `add-booking-columns.ts`), een handmatige runner
(`run-migration.mjs`) en losse SQL (`samplecatalogus-migratie.sql`).

Op 2026-08-06 is de drift hersteld:

- Alles wat deze scripts aan de productiedatabase hebben toegevoegd is
  vastgelegd in de idempotente inhaal-migratie
  **`drizzle/0041_low_edwin_jarvis.sql`**.
- De boekhoudtabel `drizzle.__drizzle_migrations` is gelijkgetrokken met
  `drizzle/meta/_journal.json` (via `repair-migration-tracking.ts`, hier
  gearchiveerd).
- `lib/db/schema.ts`, de drizzle-snapshot en de database zijn sindsdien
  identiek (controleer met `npx tsx scripts/drift-inventory.ts`).

**Schemawijzigingen gaan vanaf nu uitsluitend via drizzle-kit:**

```bash
# 1. wijzig lib/db/schema.ts
npm run db:generate   # maakt drizzle/00xx_*.sql
npm run db:migrate    # past toe + registreert
```

Deze map bestaat alleen nog als geschiedenis. De scripts opnieuw draaien is
op z'n best een no-op en op z'n slechtst een conflict met de migratieketen.
