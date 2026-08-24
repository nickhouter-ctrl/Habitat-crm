import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { SUPPLIER_KEY_SQL } from "@/lib/supplier-key";
import { NAAM_HOORT_BIJ } from "@/lib/worker-match-sql";

/**
 * Cijfers per arbeider — uren, arbeidskost, werven.
 *
 * De koppeling is bewust "id OF naam": van de 107 urenregels dragen er 55 geen
 * `worker_id`, omdat ze uit een inkoopfactuur of een import komen waar alleen
 * een naam in stond. Alleen op id kijken laat dus de helft van iemands werk
 * onzichtbaar — en dat is precies waarom een arbeider "leeg" leek.
 *
 * Naam-vergelijking gaat door dezelfde sleutel als bij leveranciers, zodat
 * "FERHAOUI MOHAMED" en "Ferhaoui Mohamed" één persoon zijn.
 */
/**
 * Hoort deze urenregel bij deze arbeider?
 *
 * "id OF naam": van de 107 urenregels dragen er 55 geen `worker_id`, omdat ze
 * uit een inkoopfactuur of een import komen waar alleen een naam in stond.
 * Alleen op id kijken laat dus de helft van iemands werk onzichtbaar — en dat
 * is precies waarom een arbeider "leeg" leek.
 */
const HOORT_BIJ = (werker: string) => sql`(
  te.worker_id = ${sql.raw(werker)}.id
  or (te.worker_id is null and ${NAAM_HOORT_BIJ(`${werker}.name`, "te.worker_name")})
)`;

export type WorkerRow = {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
  hourly_cost_eur: string | null;
  hourly_cost_cash_eur: string | null;
  default_payment_method: "cash" | "invoice";
  portal_lang: string | null;
  notes: string | null;
  uren: string | null;
  kost: string | null;
  werven: number;
  laatst: string | null;
  /** Meer dan één ploegkaart met dezelfde naam — dan staan de uren verspreid. */
  dubbele_naam: boolean;
};

/** De hele ploeg met hun cijfers, actief eerst. */
export async function workerOverview(): Promise<WorkerRow[]> {
  return db.execute<WorkerRow>(sql`
    select
      w.id, w.name, w.role, w.active, w.hourly_cost_eur::text, w.hourly_cost_cash_eur::text,
      w.default_payment_method, w.portal_lang, w.notes,
      coalesce(s.uren, 0)::text as uren,
      coalesce(s.kost, 0)::text as kost,
      coalesce(s.werven, 0)::int as werven,
      s.laatst::text as laatst,
      (select count(*) from workers d
        where ${sql.raw(SUPPLIER_KEY_SQL("d.name"))} = ${sql.raw(SUPPLIER_KEY_SQL("w.name"))}) > 1 as dubbele_naam
    from workers w
    left join lateral (
      select
        sum(te.hours) as uren,
        sum(te.hours * te.hourly_cost_eur) as kost,
        count(distinct te.project_id) as werven,
        max(te.date) as laatst
      from time_entries te
      where ${HOORT_BIJ("w")}
        -- Portaal-uren tellen pas na goedkeuring, net als op de projectpagina.
        and (te.self_logged_at is null or te.approved_at is not null)
    ) s on true
    order by w.active desc, w.name asc
  `);
}

export type WorkerProjectRow = {
  project_id: string;
  project: string | null;
  uren: string;
  kost: string;
  contant: string;
  gefactureerd: string;
  laatst: string | null;
};

/** Waar het werk van deze arbeider naartoe ging, en hoe het betaald werd. */
export async function workerProjects(id: string): Promise<WorkerProjectRow[]> {
  return db.execute<WorkerProjectRow>(sql`
    select
      p.id as project_id, p.name as project,
      sum(te.hours)::text as uren,
      round(sum(te.hours * te.hourly_cost_eur), 2)::text as kost,
      round(sum(case when te.payment_method = 'cash' then te.hours * te.hourly_cost_eur else 0 end), 2)::text as contant,
      round(sum(case when te.payment_method = 'invoice' then te.hours * te.hourly_cost_eur else 0 end), 2)::text as gefactureerd,
      max(te.date)::text as laatst
    from time_entries te
    join workers w on w.id = ${id}
    left join projects p on p.id = te.project_id
    where ${HOORT_BIJ("w")}
      and (te.self_logged_at is null or te.approved_at is not null)
    group by p.id, p.name
    order by sum(te.hours * te.hourly_cost_eur) desc nulls last
  `);
}

export type WorkerEntryRow = {
  id: string;
  date: string;
  project_id: string | null;
  project: string | null;
  hours: string;
  hourly_cost_eur: string;
  kost: string;
  payment_method: "cash" | "invoice";
  purchase_order_id: string | null;
  reference: string | null;
  zelf_geboekt: boolean;
  wacht_op_akkoord: boolean;
  note: string | null;
};

/** De urenregels zelf, nieuwste eerst. Ook de nog niet goedgekeurde portaal-uren. */
export async function workerEntries(id: string, limiet = 200): Promise<WorkerEntryRow[]> {
  return db.execute<WorkerEntryRow>(sql`
    select
      te.id, te.date::text, te.project_id, p.name as project,
      te.hours::text, te.hourly_cost_eur::text,
      round(te.hours * te.hourly_cost_eur, 2)::text as kost,
      te.payment_method, te.purchase_order_id, po.reference,
      te.self_logged_at is not null as zelf_geboekt,
      (te.self_logged_at is not null and te.approved_at is null) as wacht_op_akkoord,
      te.note
    from time_entries te
    join workers w on w.id = ${id}
    left join projects p on p.id = te.project_id
    left join purchase_orders po on po.id = te.purchase_order_id
    where ${HOORT_BIJ("w")}
    order by te.date desc, te.created_at desc
    limit ${limiet}
  `);
}

export type WorkerInvoiceRow = {
  id: string;
  reference: string | null;
  order_date: string | null;
  total: string;
  ex_btw: string;
  project: string | null;
  count_as_labor: boolean;
};

/** Facturen die op zijn naam in de inkoop staan. */
export async function workerInvoices(id: string): Promise<WorkerInvoiceRow[]> {
  return db.execute<WorkerInvoiceRow>(sql`
    select
      po.id, po.reference, po.order_date::text, po.total::text,
      coalesce(nullif(po.subtotal, 0),
               case when coalesce(po.tax, 0) <> 0 then round(po.total - po.tax, 2) else po.total end,
               0)::text as ex_btw,
      p.name as project, po.count_as_labor
    from purchase_orders po
    join workers w on w.id = ${id}
    left join projects p on p.id = po.project_id
    where ${NAAM_HOORT_BIJ("w.name", "po.supplier")}
    order by po.order_date desc nulls last
  `);
}
