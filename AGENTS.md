<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Habitat CRM — working notes for agents

CRM for **Habitat One** (Xàbia / Costa Blanca). Manages contacts & leads, deals/projects,
properties for sale, and quotes/invoices — with a two-way sync to **Holded** (the
accounting/ERP system) and inbound Holded webhooks.

## Stack
- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4
- **Drizzle ORM** over Postgres (`postgres` driver). Schema: `lib/db/schema.ts`. Client: `lib/db/index.ts`.
- **Auth.js v5 (next-auth beta)** — split config: `auth.config.ts` (edge-safe, used by `proxy.ts`)
  and `auth.ts` (full, with the Drizzle adapter + Credentials provider). Route protection in `proxy.ts`.
- **Holded** integration in `lib/holded/` (`client.ts`, `types.ts`, `sync.ts`). Webhook receiver at
  `app/api/webhooks/holded/route.ts`.
- Authenticated UI lives under the `app/(app)/` route group; `app/login/` is public.

## Conventions
- Next 16: `params`/`searchParams`, `cookies()`, `headers()` are **async** — always `await` them.
- Middleware is now **`proxy.ts`** at the project root (same behaviour as old `middleware.ts`).
- Money is stored as `numeric` (string in JS); render with `formatEUR` from `lib/utils.ts`.
- Every record that mirrors a Holded entity carries its mapping in the `holded_sync_map` table —
  never overload primary keys with external ids.
- Server-only secrets: `DATABASE_URL`, `AUTH_SECRET`, `HOLDED_API_KEY`, `HOLDED_WEBHOOK_SECRET`. See `.env.example`.

## Commands
```bash
npm run dev            # http://localhost:3000
npm run build          # production build (+ type-check)
npm run lint
npm run db:generate    # generate SQL migration from schema changes
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly (dev only)
npm run db:studio      # Drizzle Studio
npm run db:seed        # seed an admin user + sample data
```
