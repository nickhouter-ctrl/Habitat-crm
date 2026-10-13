/** Fail-closed, deterministic checks for automatically accepting a timesheet. */
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, projectAliases, projects, purchaseInvoiceReviews, timeEntries, workers } from "@/lib/db/schema";
import { workerRate } from "@/lib/worker-rate";

type SheetRow = { workerHint?: string | null; date?: string | null; projectHint?: string | null; hours?: number | null; note?: string | null; warning?: string | null };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Returns true only when every row is uniquely identified and safely recordable. */
export async function autoApproveTimesheet(reviewId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [review] = await tx.select().from(purchaseInvoiceReviews).where(eq(purchaseInvoiceReviews.id, reviewId)).for("update");
    if (!review || review.status !== "pending") return false;
    const fields = review.aiFields as { documentType?: string; timesheet?: { rows?: SheetRow[]; warnings?: string[] } } | null;
    const sheet = fields?.timesheet;
    if (fields?.documentType !== "timesheet" || !sheet?.rows?.length || sheet.warnings?.length) return false;

    const activeWorkers = await tx.select().from(workers).where(eq(workers.active, true));
    const activeProjects = await tx.select({ id: projects.id, name: projects.name }).from(projects).where(ne(projects.status, "archived"));
    const aliases = await tx.select({ projectId: projectAliases.projectId, label: projectAliases.label }).from(projectAliases);
    const projectMatches = new Map<string, Set<string>>();
    for (const p of activeProjects) projectMatches.set(normalize(p.name), new Set([p.id]));
    for (const a of aliases) {
      const found = projectMatches.get(normalize(a.label)) ?? new Set<string>();
      found.add(a.projectId);
      projectMatches.set(normalize(a.label), found);
    }

    const entries: { projectId: string; workerId: string; workerName: string; date: string; hours: string; hourlyCostEur: string; paymentMethod: "cash" | "invoice"; approvedAt: Date; note: string | null }[] = [];
    const duplicateKeys = new Set<string>();
    for (const row of sheet.rows) {
      if (row.warning || !row.workerHint || !row.date || !row.projectHint || row.hours == null || !Number.isFinite(row.hours) || row.hours <= 0 || row.hours > 24) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`))) return false;
      const workerCandidates = activeWorkers.filter((w) => normalize(w.name) === normalize(row.workerHint!));
      const projectIds = projectMatches.get(normalize(row.projectHint));
      if (workerCandidates.length !== 1 || !projectIds || projectIds.size !== 1) return false;
      const worker = workerCandidates[0];
      const projectId = [...projectIds][0];
      const rate = workerRate(worker, worker.defaultPaymentMethod);
      if (rate == null) return false;
      const key = `${worker.id}:${projectId}:${row.date}`;
      if (duplicateKeys.has(key)) return false;
      duplicateKeys.add(key);
      const existing = await tx.select({ id: timeEntries.id }).from(timeEntries).where(and(eq(timeEntries.workerId, worker.id), eq(timeEntries.projectId, projectId), eq(timeEntries.date, row.date))).limit(1);
      if (existing.length) return false;
      entries.push({
        workerId: worker.id, workerName: worker.name, projectId, date: row.date,
        hours: String(Math.round(row.hours * 100) / 100), hourlyCostEur: String(rate),
        paymentMethod: worker.defaultPaymentMethod, approvedAt: new Date(),
        note: [`Excel-urenstaat [urenstaat-email:${review.emailId}]`, row.note, `Excel-project: ${row.projectHint}`].filter(Boolean).join(" · "),
      });
    }
    await tx.insert(timeEntries).values(entries);
    await tx.update(purchaseInvoiceReviews).set({
      status: "approved", decidedBy: null, decidedAt: new Date(), decidedVia: "agent",
      decisionNote: `Automatisch goedgekeurd na deterministische controles: ${entries.length} urenregels; werknemer, project, datum, uren, individueel tarief en duplicaten gecontroleerd.`,
      updatedAt: new Date(),
    }).where(eq(purchaseInvoiceReviews.id, reviewId));
    await tx.insert(activities).values({ type: "note", subject: "Urenstaat automatisch goedgekeurd · steekproefcontrole aanbevolen", body: `${entries.length} urenregels automatisch geregistreerd na exacte controles op werknemer, project, datum, uren, persoonlijk uurtarief en duplicaten. Bron: ${review.proposedReference ?? "Excel-urenstaat"}.`, authorId: null });
    return true;
  });
}
