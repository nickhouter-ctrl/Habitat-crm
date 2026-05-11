# Habitat CRM

Internal CRM for **Habitat One** — the platform for building, renovating and living in Xàbia
(Jávea), Costa Blanca. Tracks **contacts & leads**, **deals / projects**, **properties for sale**
and **quotes & invoices**, and keeps a two-way sync with **Holded** (accounting / ERP) plus
inbound Holded webhooks.

Sibling project: [`habitat-one`](../habitat-one) — the public marketing & catalogue site.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** — design tokens in `app/globals.css`
- **Drizzle ORM** over **Postgres** (`postgres` driver) — schema in `lib/db/schema.ts`
- **Auth.js v5** (next-auth beta) — email/password (Credentials) with the Drizzle adapter
- **Holded** integration — `lib/holded/` + webhook receiver at `app/api/webhooks/holded`
- **lucide-react** icons

## Getting started

```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL, AUTH_SECRET, HOLDED_API_KEY
npm run db:push                 # create the schema in your database
npm run db:seed                 # create an admin user + sample data
npm run dev                     # http://localhost:3000
```

You need a Postgres database. For local dev, any Postgres works
(`postgres://postgres:postgres@localhost:5432/habitat_crm`). For production, provision
**Neon** via the Vercel Marketplace and use its pooled connection string as `DATABASE_URL`.

Generate `AUTH_SECRET` with `openssl rand -base64 33`.

## Project layout

| Path | What |
| --- | --- |
| `app/(app)/` | Authenticated app — dashboard, contacts, deals, properties, invoices |
| `app/login/` | Sign-in page (public) |
| `app/api/auth/[...nextauth]/` | Auth.js route handler |
| `app/api/webhooks/holded/` | Inbound Holded webhook receiver |
| `auth.config.ts` / `auth.ts` | Auth.js config (edge-safe split + full) |
| `proxy.ts` | Route protection (Next 16 "middleware") |
| `lib/db/` | Drizzle schema (`schema.ts`) and client (`index.ts`) |
| `lib/holded/` | Holded API client, types, sync helpers |
| `components/` | UI building blocks (button, card, table, badge, …) |
| `scripts/seed.ts` | Seed script |
| `drizzle/` | Generated SQL migrations |

## Holded integration

- **Contacts** — `lib/holded/sync.ts` maps Habitat contacts ⇄ Holded contacts; mappings are stored
  in the `holded_sync_map` table (never overload primary keys with external ids).
- **Documents** — quotes (`estimate`) and invoices (`invoice`) are read from Holded's invoicing API
  and mirrored locally.
- **Webhooks** — Holded posts events to `/api/webhooks/holded`; the handler verifies a shared secret
  (`HOLDED_WEBHOOK_SECRET`) and upserts the affected record.

Exact sync flows (which direction is source-of-truth per field, conflict handling) are still TBD —
the table structure and client are in place so the rules can be layered on.

## Deploy

Deploy on Vercel. Set `DATABASE_URL`, `AUTH_SECRET`, `HOLDED_API_KEY`, `HOLDED_WEBHOOK_SECRET` as
environment variables, then run migrations (`npm run db:migrate`) against the production database.
