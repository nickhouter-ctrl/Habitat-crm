import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { docOwnShare } from "@/lib/documents";
import { deriveAdvanceCover, deriveProjectMargins } from "@/lib/project-financials";
import { splitProjectReceipts, type ReceiptLike } from "@/lib/receipts";

/** One funding calculation for the start screen, project list and detail.
 * Pending invoice reviews are not purchase orders and are deliberately absent.
 * Amounts are booked costs, not assertions about payments to suppliers.
 */
export async function loadProjectFunding(projectId?:string, includeClosed = false) {
  const [rows,productRows]=await Promise.all([
    db.execute<{
      id:string;name:string;labor:string;purchase:string;laborPct:string|null;purchasePct:string|null;
      payments:ReceiptLike[];docs:{id:string;items:unknown;subtotal:string}[];
    }>(sql`select p.id,p.name,p.labor_margin_pct "laborPct",p.purchase_margin_pct "purchasePct",
      coalesce((select sum(t.hours*t.hourly_cost_eur) from time_entries t where t.project_id=p.id
        and not(t.self_logged_at is not null and t.approved_at is null)),0)::text labor,
      (coalesce((select sum(coalesce(nullif(po.subtotal,0),case when coalesce(po.tax,0)<>0 then po.total-po.tax else po.total end,0))
        from purchase_orders po where po.project_id=p.id and not po.count_as_labor),0)
        + coalesce((select sum(c.amount_eur) from project_costs c where c.project_id=p.id),0))::text purchase,
      coalesce((select jsonb_agg(jsonb_build_object('documentId',r.document_id,'amountEur',r.amount_eur,'method',r.method,'vatRate',r.vat_rate,
        'vatAmountEur',r.vat_amount_eur,'docSubtotal',d.subtotal_eur,'docTotal',d.total_eur))
        from project_payments r left join documents d on d.id=r.document_id where r.project_id=p.id),'[]'::jsonb) payments,
      coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'items',d.items,'subtotal',d.subtotal_eur)) from documents d
        where d.project_id=p.id and exists(select 1 from project_payments r where r.project_id=p.id and r.document_id=d.id)),'[]'::jsonb) docs
      from projects p where ${projectId?sql`p.id=${projectId}`:includeClosed?sql`true`:sql`p.status='active'`}`),
    db.execute<{id:string;sku:string|null;cost:string|null}>(sql`select id,sku,cost_eur::text cost from products`),
  ]);
  const byId=new Map(productRows.map(p=>[p.id,Number(p.cost)]));
  const bySku=new Map(productRows.filter(p=>p.sku).map(p=>[p.sku!,Number(p.cost)]));
  return new Map(rows.map(p=>{
    const ownShareByDoc = new Map(p.docs.map(d => [d.id, docOwnShare(d.items, Number(d.subtotal),
      it => (it.productId ? byId.get(it.productId) : undefined) ?? (it.description ? bySku.get(it.description.trim()) : undefined))]));
    const receipts = splitProjectReceipts(p.payments, ownShareByDoc);
    const margins=deriveProjectMargins({laborCost:Number(p.labor),purchaseCost:Number(p.purchase),productCost:0,productRevenue:0,
      laborMarginPct:p.laborPct==null?null:Number(p.laborPct),purchaseMarginPct:p.purchasePct==null?null:Number(p.purchasePct)});
    const cover=deriveAdvanceCover({laborCost:Number(p.labor),purchaseCost:Number(p.purchase),
      coverReceivedEx:receipts.liquidReceived,ownProductReceivedEx:receipts.ownProductReceived,requiredRevenue:margins.totalRevenue});
    return [p.id,{id:p.id,name:p.name,cover,ownShareByDoc}] as const;
  }));
}
