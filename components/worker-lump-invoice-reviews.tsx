import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerLumpInvoices, workers } from "@/lib/db/schema";
import { requireModuleRead } from "@/lib/auth/guards";
import { formatEUR } from "@/lib/utils";
import { WorkerLumpReviewForm } from "./worker-lump-review-form";

/** Losse facturen zonder uren van dit project, bij de weekstaten. */
export async function WorkerLumpInvoiceReviews({ projectId }: { projectId: string }) {
  const access = await requireModuleRead("projects");
  const rows = await db.select({ l: workerLumpInvoices, worker: workers.name }).from(workerLumpInvoices)
    .innerJoin(workers, eq(workers.id, workerLumpInvoices.workerId))
    .where(and(eq(workerLumpInvoices.projectId, projectId))).orderBy(desc(workerLumpInvoices.createdAt)).limit(50);
  if (!rows.length) return null;
  const labels: Record<string, string> = { submitted: "Te controleren", approved: "Goedgekeurd", returned: "Teruggestuurd" };
  return <section className="my-5 space-y-3"><h2 className="text-lg font-semibold">Facturen zonder uren (vaste prijs)</h2>
    {rows.map(({ l, worker }) => <details key={`${l.id}:${l.version}`} open={l.status === "submitted"} className="rounded-xl border bg-surface p-4">
      <summary className="cursor-pointer font-medium">{worker} · factuur {l.invoice.number} · {formatEUR(l.invoice.subtotal)} ex. btw · {labels[l.status]}</summary>
      <div className="mt-3 space-y-2 text-sm">
        <p className="whitespace-pre-wrap">{l.invoice.concept}</p>
        <p className="text-muted">{l.invoice.legalName} · {l.invoice.taxId} · IVA {l.invoice.vatRate}% · IRPF {l.invoice.withholdingRate}% · te betalen {formatEUR(l.invoice.total)}</p>
        {l.reviewNote && <p className="rounded-lg bg-amber-50 p-3 text-amber-900 whitespace-pre-wrap">{l.reviewNote}</p>}
        <a href={`/api/worker-weeks/${l.id}/invoice`} target="_blank" rel="noopener" className="text-accent underline">Factuur openen</a>
        {l.status === "approved" && l.purchaseOrderId && <a href={`/inkooporders/${l.purchaseOrderId}`} className="ml-3 text-accent underline">In Inkoop</a>}
      </div>
      {l.status === "submitted" && access.heeftCap("schrijven") && <WorkerLumpReviewForm id={l.id} projectId={l.projectId} version={l.version} />}
    </details>)}
  </section>;
}
