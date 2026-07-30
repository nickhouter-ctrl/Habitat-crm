/**
 * Maakt `purchase_invoice_reviews` — de wachtrij vóór de inkoopadministratie.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt over een
 * bestaande CHECK-constraint (parse-bug in drizzle-kit, niet in dit schema).
 *
 * Idempotent: alles is `if not exists`. Draait ook de historie-backfill, zodat
 * de wachtrij niet volloopt met facturen die al lang verwerkt zijn.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    create table if not exists purchase_invoice_reviews (
      id uuid primary key default gen_random_uuid(),
      email_id uuid not null references email_inbox(id) on delete cascade,
      mail_attachment_id uuid not null references mail_attachments(id) on delete cascade,
      status text not null default 'pending',
      source text not null default 'auto',
      proposed_supplier text,
      proposed_reference text,
      proposed_total numeric(14, 2),
      proposed_subtotal numeric(14, 2),
      proposed_currency text,
      proposed_total_original numeric(14, 2),
      fx_rate numeric(14, 6),
      proposed_invoice_date date,
      suggested_project_id uuid references projects(id) on delete set null,
      suggested_kind text,
      suggested_hours numeric(8, 2),
      ai_fields jsonb,
      ai_read_ok boolean,
      ai_error text,
      ai_model text,
      ai_prompt_version integer,
      ai_checked_at timestamptz,
      ai_attempts integer not null default 0,
      verdict text not null default 'pending',
      findings jsonb,
      duplicate_of_po_id uuid references purchase_orders(id) on delete set null,
      supplier_email text,
      supplier_email_source text,
      purchase_order_id uuid references purchase_orders(id) on delete set null,
      decided_by uuid references users(id) on delete set null,
      decided_at timestamptz,
      decided_via text,
      decision_note text,
      reject_message_id text,
      notified_at timestamptz,
      action_token text unique,
      action_token_expires_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await db.execute(
    sql`create unique index if not exists purchase_invoice_reviews_attachment_idx on purchase_invoice_reviews (mail_attachment_id)`,
  );
  await db.execute(sql`create index if not exists purchase_invoice_reviews_status_idx on purchase_invoice_reviews (status)`);
  await db.execute(sql`create index if not exists purchase_invoice_reviews_email_idx on purchase_invoice_reviews (email_id)`);
  await db.execute(
    sql`create index if not exists purchase_invoice_reviews_reference_idx on purchase_invoice_reviews (proposed_reference)`,
  );

  // Verdeling van één inkoopfactuur over meerdere projecten: de kostenregel
  // onthoudt uit welke inkooporder hij komt.
  await db.execute(
    sql`alter table project_costs add column if not exists purchase_order_id uuid references purchase_orders(id) on delete set null`,
  );

  // Threading van een afkeurmail: de References-header van de binnenkomende mail
  // bewaren, anders valt een langere heen-en-weer uit elkaar in Gmail.
  await db.execute(sql`alter table email_inbox add column if not exists references_header text`);

  // Historie: alles wat al aan een inkooporder hangt telt als goedgekeurd, zodat
  // de wachtrij alleen nieuwe facturen toont.
  const backfill = await db.execute<{ n: string }>(sql`
    with ingevoegd as (
      insert into purchase_invoice_reviews (
        email_id, mail_attachment_id, status, source, proposed_supplier,
        proposed_total, purchase_order_id, decided_at, decision_note, verdict
      )
      select distinct on (a.id)
        e.id, a.id, 'approved', 'manual', a.supplier_tag,
        a.amount_eur, e.linked_purchase_order_id, po.created_at,
        'Historisch — aangemaakt vóór de goedkeuringspoort', 'ok'
      from mail_attachments a
      join email_inbox e on e.id = a.email_id
      join purchase_orders po on po.id = e.linked_purchase_order_id
      where e.linked_purchase_order_id is not null
      on conflict (mail_attachment_id) do nothing
      returning 1
    )
    select count(*)::text as n from ingevoegd
  `);

  const [check] = await db.execute<{ n: string }>(sql`select count(*)::text as n from purchase_invoice_reviews`);
  console.log(`OK: purchase_invoice_reviews bestaat · ${backfill[0]?.n ?? 0} historische rijen toegevoegd · ${check?.n ?? 0} rijen totaal`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
