# Habitat CRM

Intern CRM voor **Habitat One & One SL** (Xàbia / Costa Blanca).
Beheert contacten & leads, deals, projecten, panden, producten/voorraad,
offertes/facturen/pakbonnen en de live-koppeling met **Holded** (ERP).

## Stack
- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Tailwind CSS v4
- Drizzle ORM op Postgres (Supabase)
- Auth.js v5 (e-mail + wachtwoord)
- Vercel (deploys auto vanaf `main`)
- Holded API + webhooks
- Anthropic API voor PDF/proforma-uitlezen

## Lokaal draaien
```bash
npm install
cp .env.example .env.local   # vul de keys in
npm run db:migrate           # schema toepassen
npm run db:seed              # admin-user aanmaken
npm run dev                  # http://localhost:3000
```

## Belangrijke commando's
```bash
npm run build         # productie-build + typecheck
npm run lint          # ESLint
npm run db:generate   # SQL-migratie genereren uit schemaschanges
npm run db:migrate    # migraties toepassen
npm run db:studio     # Drizzle Studio
```

## Deploys
Push naar `main` → Vercel deployt automatisch naar productie. Preview-URL's
worden vanzelf gemaakt voor andere branches.

## Documentatie
Voor agents / nieuwe ontwikkelaars: `AGENTS.md`.
