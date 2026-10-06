import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deriveAdvanceCover, deriveProjectMargins } from "@/lib/project-financials";
import { projectReceiptShares, splitProjectReceipts, type ReceiptLike } from "@/lib/receipts";
import { projectCostStreams, projectOwnProducts } from "@/lib/project-cost-streams";
import { clientFundingProducts } from "@/lib/client-funding-products";

/** One funding calculation for the start screen, project list and detail.
 * Pending invoice reviews are not purchase orders and are deliberately absent.
 * Amounts are booked costs, not assertions about payments to suppliers.
 */
export async function loadProjectFunding(projectId?:string, includeClosed = false) {
  const [rows,productRows]=await Promise.all([
    db.execute<{
      id:string;name:string;labor:string;laborPct:string|null;purchasePct:string|null;
      payments:ReceiptLike[];docs:{id:string;docNumber:string|null;kind:string;status:string;items:unknown;subtotal:string}[];
      purchases:Parameters<typeof projectCostStreams>[0]; costs:Parameters<typeof projectCostStreams>[1];
      deliveries:unknown;extraRevenue:string;extraCost:string;
    }>(sql`select p.id,p.name,p.labor_margin_pct "laborPct",p.purchase_margin_pct "purchasePct",
      coalesce((select sum(t.hours*t.hourly_cost_eur) from time_entries t where t.project_id=p.id
        and not(t.self_logged_at is not null and t.approved_at is null)),0)::text labor,
      coalesce((select jsonb_agg(jsonb_build_object('documentId',r.document_id,'advanceRequestId',r.advance_request_id,'amountEur',r.amount_eur,'method',r.method,'vatRate',r.vat_rate,
        'vatAmountEur',r.vat_amount_eur,'docSubtotal',d.subtotal_eur,'docTotal',d.total_eur))
        from project_payments r left join documents d on d.id=r.document_id where r.project_id=p.id),'[]'::jsonb) payments,
      coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'docNumber',d.doc_number,'kind',d.kind,'status',d.status,'items',d.items,'subtotal',d.subtotal_eur)) from documents d
        where d.project_id=p.id),'[]'::jsonb) docs,
      coalesce((select jsonb_agg(jsonb_build_object('supplier',po.supplier,'currency',po.currency,'notes',po.notes,'items',po.items,
        'subtotal',po.subtotal,'tax',po.tax,'total',po.total)) from purchase_orders po where po.project_id=p.id and not po.count_as_labor),'[]'::jsonb) purchases,
      coalesce((select jsonb_agg(jsonb_build_object('description',c.description,'category',c.category,'note',c.note,'amountEur',c.amount_eur,
        'source',case when po.id is null then null else jsonb_build_object('supplier',po.supplier,'notes',po.notes,'items',po.items,'countAsLabor',po.count_as_labor) end))
        from project_costs c left join purchase_orders po on po.id=c.purchase_order_id where c.project_id=p.id),'[]'::jsonb) costs,
      coalesce((select jsonb_agg(jsonb_build_object('name',d.product_name,'productId',d.product_id,'description',d.sku,'category','eigen_producten',
        'units',d.qty,'price',coalesce(d.total_price_eur/nullif(d.qty,0),0),'costEur',d.total_cost_eur/nullif(d.qty,0)))
        from project_deliveries d where d.project_id=p.id and d.reversed_at is null),'[]'::jsonb) deliveries,
      coalesce((select sum(e.amount_eur) from project_extras e where e.project_id=p.id),0)::text "extraRevenue",
      coalesce((select sum(e.cost_eur) from project_extras e where e.project_id=p.id),0)::text "extraCost"
      from projects p where ${projectId?sql`p.id=${projectId}`:includeClosed?sql`true`:sql`p.status='active'`}`),
    db.execute<{id:string;sku:string|null;cost:string|null}>(sql`select id,sku,cost_eur::text cost from products`),
  ]);
  const byId=new Map(productRows.map(p=>[p.id,Number(p.cost)]));
  const bySku=new Map(productRows.filter(p=>p.sku).map(p=>[p.sku!,Number(p.cost)]));
  return new Map(rows.map(p=>{
    const ownShareByDoc = projectReceiptShares(p.docs, p.payments,
      it => (it.productId ? byId.get(it.productId) : undefined) ?? (it.description ? bySku.get(it.description.trim()) : undefined));
    const receipts = splitProjectReceipts(p.payments, ownShareByDoc);
    const costs = projectCostStreams(p.purchases,p.costs);
    const own = projectOwnProducts([...p.docs,{kind:"invoice",status:"paid",items:p.deliveries}],costs.groups,
      it => (it.productId ? byId.get(it.productId) : undefined) ?? (it.description ? bySku.get(it.description.trim()) : undefined));
    own.revenue += Number(p.extraRevenue);
    own.totalRevenue += Number(p.extraRevenue);
    own.cost += Number(p.extraCost);
    own.bookedCost += Number(p.extraCost);
    const margins=deriveProjectMargins({laborCost:Number(p.labor),purchaseCost:costs.material,otherCost:costs.other,
      productCost:own.cost,productRevenue:own.revenue,uncostedProductRevenue:own.uncosted,
      laborMarginPct:p.laborPct==null?null:Number(p.laborPct),purchaseMarginPct:p.purchasePct==null?null:Number(p.purchasePct)});
    const cover=deriveAdvanceCover({laborCost:Number(p.labor),purchaseCost:costs.material+costs.other,
      coverReceivedEx:receipts.liquidReceived,ownProductReceivedEx:receipts.ownProductReceived,
      requiredRevenue:margins.laborRevenue+margins.purchaseRevenue+margins.otherRevenue});
    const productReceipts = clientFundingProducts(p.docs, p.payments, ownShareByDoc,
      it => (it.productId ? byId.get(it.productId) : undefined) ?? (it.description ? bySku.get(it.description.trim()) : undefined));
    return [p.id,{id:p.id,name:p.name,cover,ownShareByDoc,costs,own,margins,productReceipts}] as const;
  }));
}
