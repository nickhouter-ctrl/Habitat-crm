"use server";

/**
 * Acties van de goedkeuringspoort. Elke actie is een bewuste beslissing over
 * geld dat de deur uit gaat, dus: alleen voor gebruikers die mogen bewerken, en
 * altijd met een spoor in `activities` van wie het deed.
 */
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";

import { requireModule } from "@/lib/auth/guards";
import {
  approveInvoiceReview,
  attachReviewToSibling,
  ignoreInvoiceReview,
  rejectInvoiceReview,
  type ApprovalOverrides,
} from "@/lib/purchase-invoice-intake";
import { db } from "@/lib/db";
import { activities, projects, purchaseInvoiceReviews, timeEntries, workers } from "@/lib/db/schema";
import { workerRate } from "@/lib/worker-rate";

/** Bedrag-string (NL-komma of punt) → number; leeg/ongeldig → null. */
function amountOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function uuidOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 36 ? s : null;
}

function refresh() {
  revalidatePath("/inkooporders/te-verwerken");
  revalidatePath("/inkooporders");
  revalidatePath("/");
}

/** Keur een Excel-urenstaat goed. Dit maakt alleen urenregels, nooit een inkooporder. */
export async function approveTimesheetReviewAction(reviewId: string, formData: FormData) {
  const user = await requireModule("inkoop");
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) throw new Error("Ongeldige urenstaat.");
  const count = Number(formData.get("rowCount"));
  if (!Number.isInteger(count) || count < 1 || count > 300) throw new Error("Ongeldig aantal urenregels.");

  await db.transaction(async (tx) => {
    const [review] = await tx.select().from(purchaseInvoiceReviews)
      .where(eq(purchaseInvoiceReviews.id, reviewId)).for("update");
    if (!review || review.status !== "pending") throw new Error("Deze urenstaat is al verwerkt of bestaat niet meer.");
    const fields = review.aiFields as { documentType?: string; timesheet?: { rows?: unknown[] } } | null;
    if (fields?.documentType !== "timesheet" || fields.timesheet?.rows?.length !== count)
      throw new Error("De urenstaatgegevens zijn gewijzigd. Vernieuw de pagina en controleer opnieuw.");

    const entries = [];
    for (let i = 0; i < count; i++) {
      const workerId = String(formData.get(`worker_${i}`) ?? "");
      const projectId = String(formData.get(`project_${i}`) ?? "");
      const date = String(formData.get(`date_${i}`) ?? "");
      const hours = amountOrNull(formData.get(`hours_${i}`));
      if (!/^[0-9a-f-]{36}$/i.test(workerId) || !/^[0-9a-f-]{36}$/i.test(projectId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || hours == null || hours <= 0 || hours > 24)
        throw new Error(`Regel ${i + 1}: werknemer, project, datum of uren ontbreken/kloppen niet.`);
      const [worker] = await tx.select().from(workers).where(and(eq(workers.id, workerId), eq(workers.active, true))).limit(1);
      const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), ne(projects.status, "archived"))).limit(1);
      if (!worker || !project) throw new Error(`Regel ${i + 1}: werknemer of project is niet meer actief.`);
      const rate = workerRate(worker, worker.defaultPaymentMethod);
      if (rate == null) throw new Error(`${worker.name} heeft geen uurtarief voor ${worker.defaultPaymentMethod === "cash" ? "contante betaling" : "factuur"}. Vul eerst het juiste tarief in bij de ploeg.`);
      const original = (fields.timesheet.rows[i] ?? {}) as { note?: string | null; projectHint?: string | null };
      entries.push({ projectId, workerId, workerName: worker.name, date, hours: String(hours), hourlyCostEur: String(rate), paymentMethod: worker.defaultPaymentMethod, approvedAt: new Date(), note: [`Excel-urenstaat [urenstaat-email:${review.emailId}]`, original.note, original.projectHint ? `Excel-project: ${original.projectHint}` : null].filter(Boolean).join(" · ") });
    }
    await tx.insert(timeEntries).values(entries);
    await tx.update(purchaseInvoiceReviews).set({
      status: "approved", decidedBy: user.id, decidedAt: new Date(), decidedVia: "app",
      decisionNote: `${entries.length} urenregels uit Excel geregistreerd`, updatedAt: new Date(),
    }).where(eq(purchaseInvoiceReviews.id, reviewId));
    await tx.insert(activities).values({ type: "note", subject: "Excel-urenstaat goedgekeurd", body: `${entries.length} projecturenregels geregistreerd vanuit ${review.proposedReference ?? "urenstaat"}.`, authorId: user.id });
  });

  refresh();
  revalidatePath("/projects");
}

export async function approveReviewAction(reviewId: string, formData: FormData) {
  const user = await requireModule("inkoop");

  // Verdeling over meerdere werven: regel-index → project + uren + bedrag.
  //
  // Een regel telt zodra er een PROJECT op staat. Het bedrag mocht eerder niet
  // ontbreken, en dat kostte een factuur zijn koppeling: wie de werven invulde
  // maar de bedragen leeg liet — bij een urenfactuur vul je uren, niet bedragen —
  // hield niets over, en het losse projectveld is bij een verdeling verborgen.
  // Wat er dan gebeurde: "goedgekeurd · nog geen project".
  const split: NonNullable<ApprovalOverrides["split"]> = [];
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^split_(\d+)_projectId$/);
    if (!m) continue;
    const projectId = uuidOrNull(value);
    if (!projectId) continue;
    split.push({
      projectId,
      amount: amountOrNull(formData.get(`split_${m[1]}_amount`)),
      hours: amountOrNull(formData.get(`split_${m[1]}_hours`)),
    });
  }

  const overrides: ApprovalOverrides = {
    supplier: String(formData.get("supplier") ?? "").trim() || null,
    reference: String(formData.get("reference") ?? "").trim() || null,
    total: amountOrNull(formData.get("total")),
    subtotal: amountOrNull(formData.get("subtotal")),
    // Eén werf is geen verdeling: dan hangt de inkooporder er gewoon zelf aan.
    projectId: uuidOrNull(formData.get("projectId")) ?? (split.length === 1 ? split[0].projectId : null),
    kind: formData.get("kind") === "labor" ? "labor" : formData.get("kind") === "material" ? "material" : null,
    hours: amountOrNull(formData.get("hours")) ?? (split.length === 1 ? split[0].hours ?? null : null),
    hoursAlreadyLogged: formData.get("hoursAlreadyLogged") === "on",
    overhead: formData.get("overhead") === "on",
    split: split.length > 1 ? split : undefined,
  };

  const review = await db.query.purchaseInvoiceReviews.findFirst({ where: eq(purchaseInvoiceReviews.id, reviewId) });
  if (review && overrides.kind === "labor") {
    const sameMail = await db.select().from(purchaseInvoiceReviews).where(and(
      eq(purchaseInvoiceReviews.emailId, review.emailId),
      eq(purchaseInvoiceReviews.status, "pending"),
    ));
    const pendingTimesheet = sameMail.some((r) => (r.aiFields as { documentType?: string } | null)?.documentType === "timesheet");
    if (pendingTimesheet && !overrides.hoursAlreadyLogged)
      throw new Error("Keur eerst de Excel-urenstaat uit dezelfde mail goed. Dan voorkomt het systeem dat dezelfde uren dubbel worden geboekt.");
  }
  if (review && overrides.kind === "labor") {
    const approvedSibling = await db.select({ id: purchaseInvoiceReviews.id }).from(purchaseInvoiceReviews).where(and(
      eq(purchaseInvoiceReviews.emailId, review.emailId),
      eq(purchaseInvoiceReviews.status, "approved"),
    ));
    if (approvedSibling.some((r) => r.id !== reviewId)) {
      const approvedTimesheet = await db.select().from(purchaseInvoiceReviews).where(and(
        eq(purchaseInvoiceReviews.emailId, review.emailId), eq(purchaseInvoiceReviews.status, "approved"),
      ));
      if (approvedTimesheet.some((r) => (r.aiFields as { documentType?: string } | null)?.documentType === "timesheet"))
        overrides.hoursAlreadyLogged = true;
    }
  }

  await approveInvoiceReview({ reviewId, overrides, userId: user.id, via: "app" });
  refresh();
}

export async function rejectReviewAction(reviewId: string, formData: FormData) {
  const user = await requireModule("inkoop");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return; // zonder reden afkeuren zegt de leverancier niets

  // Terugsturen is optioneel: soms wil je alleen intern blokkeren en zelf mailen.
  const to = String(formData.get("mailTo") ?? "").trim();
  const subject = String(formData.get("mailSubject") ?? "").trim();
  const body = String(formData.get("mailBody") ?? "").trim();
  const verstuur = formData.get("sendMail") === "on" && to.includes("@") && subject && body;

  await rejectInvoiceReview({
    reviewId,
    reason,
    userId: user.id,
    via: "app",
    mail: verstuur
      ? {
          to,
          subject,
          text: body,
          // De bewerkte tekst is platte tekst; als HTML alleen de regelovergangen
          // omzetten, zodat wat de gebruiker las ook verstuurd wordt.
          html: `<div style="white-space:pre-wrap">${escapeForHtml(body)}</div>`,
          attachInvoice: formData.get("attachInvoice") === "on",
        }
      : undefined,
    sender: { name: user.name },
  });
  refresh();
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Negeren met een korte reden. De reden is een leersignaal: hetzelfde soort
 * bestand van dezelfde afzender komt daarna niet meer bovenaan de wachtrij.
 */
export async function ignoreReviewAction(reviewId: string, reden?: string) {
  const user = await requireModule("inkoop");
  await ignoreInvoiceReview({ reviewId, userId: user.id, reden: reden ?? null });
  refresh();
}

/** Dit is geen eigen factuur maar een specificatie (urenverantwoording, pakbon)
 *  bij een andere factuur uit dezelfde mail: koppel de PDF daaraan. */
export async function attachToSiblingAction(reviewId: string, targetReviewId: string) {
  const user = await requireModule("inkoop");
  await attachReviewToSibling({ reviewId, targetReviewId, userId: user.id });
  refresh();
}
