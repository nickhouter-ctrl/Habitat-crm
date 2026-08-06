import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Nacalculatie: gecalculeerde kost (budgetregels uit de offerte-hoofdstukken)
 * naast de werkelijke projectkosten, zodat het prijzenboek bijgesteld kan
 * worden waar het structureel afwijkt.
 *
 * Werkelijke kost = arbeid (uren × tarief) + inkoop (ex btw) + losse kosten +
 * geleverde producten — dezelfde optelling als de projectpagina, mínus de
 * kostprijs van los gefactureerde catalogusproducten (die route wordt bij
 * aanneemsom-projecten niet meer gebruikt).
 */
export type NacalculatieRij = {
  projectId: string;
  naam: string;
  begrootVerkoop: number;
  begrootKost: number;
  werkelijkeKost: number;
};

export async function nacalculatieRijen(): Promise<NacalculatieRij[]> {
  return await db.execute<NacalculatieRij>(sql`
    select p.id "projectId", p.name naam,
      (select coalesce(sum(b.amount_eur),0) from project_budget_lines b
        where b.project_id = p.id)::float8 "begrootVerkoop",
      (select coalesce(sum(b.estimated_cost_eur),0) from project_budget_lines b
        where b.project_id = p.id)::float8 "begrootKost",
      ( (select coalesce(sum(t.hours * t.hourly_cost_eur),0) from time_entries t
          where t.project_id = p.id and not (t.self_logged_at is not null and t.approved_at is null))
      + (select coalesce(sum(coalesce(nullif(po.subtotal,0),
              case when coalesce(po.tax,0) <> 0 then po.total - po.tax else po.total end, 0)),0)
          from purchase_orders po where po.project_id = p.id and not po.count_as_labor)
      + (select coalesce(sum(c.amount_eur),0) from project_costs c where c.project_id = p.id)
      + (select coalesce(sum(d.total_cost_eur),0) from project_deliveries d
          where d.project_id = p.id and d.reversed_at is null)
      )::float8 "werkelijkeKost"
    from projects p
    where exists (select 1 from project_budget_lines b
                  where b.project_id = p.id and b.estimated_cost_eur is not null)
    order by p.name`);
}
