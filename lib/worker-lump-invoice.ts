import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workerLumpInvoices as lumps, workerWeekSheets as sheets, workers, purchaseOrders, staffNotifications, users } from "@/lib/db/schema";
import { heeftCap, magModule } from "@/lib/auth/modules";
import { NICK_FREDERIQUE } from "@/lib/mail-bcc";
import { invoiceAmounts, invoiceKey, type SupplierInvoiceInput, type WeekLang, type WorkerInvoice } from "@/lib/worker-week";
import { COMPANY } from "@/lib/company";
import { WeekConflict } from "@/lib/worker-week-service";

const conflict = (message = "conflict"): never => { throw new WeekConflict(message); };

/**
 * Losse factuur zonder uren indienen (of een teruggestuurde opnieuw). Het
 * bedrag is ex. btw; btw en IRPF rekenen we zoals bij een weekfactuur.
 */
export async function submitLumpInvoice(args: { worker: { id: string; name: string }; projectId: string; projectName: string;
  input: SupplierInvoiceInput; concept: string; amount: number; language: WeekLang; replaceId?: string }) {
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(workers).where(eq(workers.id, args.worker.id)).for("update");
    if (!w?.portalInvoiceEnabled) conflict("invoiceDisabled");
    const key = invoiceKey(args.input.taxId, args.input.number);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    // Hetzelfde nummer mag nergens anders al staan: weekfactuur, losse factuur of Inkoop.
    const [inSheet] = await tx.select({ id: sheets.id }).from(sheets).where(eq(sheets.invoiceKey, key)).limit(1);
    const [inLump] = await tx.select({ id: lumps.id }).from(lumps).where(and(eq(lumps.invoiceKey, key), args.replaceId ? ne(lumps.id, args.replaceId) : undefined)).limit(1);
    const [inPo] = await tx.select({ id: purchaseOrders.id }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.reference, args.input.number), sql`lower(trim(${purchaseOrders.supplier})) = ${args.input.legalName.toLowerCase()}`)).limit(1);
    if (inSheet || inLump || inPo) conflict("duplicateInvoice");
    const amounts = invoiceAmounts(1, args.amount, args.input.vatRate, args.input.withholdingRate);
    const invoice: WorkerInvoice = { ...args.input, concept: args.concept, customer: { name: COMPANY.legalName, taxId: COMPANY.vatNumber, address: COMPANY.address },
      hours: 0, rate: 0, ...amounts, language: args.language, projectName: args.projectName, weekStart: args.input.date };
    if (args.replaceId) {
      const [old] = await tx.select().from(lumps).where(and(eq(lumps.id, args.replaceId), eq(lumps.workerId, args.worker.id), eq(lumps.projectId, args.projectId))).for("update");
      if (!old || old.status !== "returned") conflict();
      await tx.update(lumps).set({ invoice, invoiceKey: key, status: "submitted", version: old!.version + 1, updatedAt: new Date() }).where(eq(lumps.id, old!.id));
      return { id: old!.id, notificationIds: await queueLumpNotice(tx, old!.id, old!.version + 1) };
    }
    const [row] = await tx.insert(lumps).values({ workerId: args.worker.id, projectId: args.projectId, invoice, invoiceKey: key }).returning({ id: lumps.id, version: lumps.version });
    return { id: row.id, notificationIds: await queueLumpNotice(tx, row.id, row.version) };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Melding voor kantoor, net als bij een ingediende weekstaat (zelfde ontvanger,
 * zelfde mailsoort). De eventKey begint met "worker-lump:" — zo weet de
 * verzending dat het om een factuur zonder uren gaat. Geen eigen soort, want
 * die vraagt een migratie van de check-constraint.
 */
async function queueLumpNotice(tx: Tx, id: string, version: number): Promise<string[]> {
  // Lokaal/preview met externe effecten uit mag geen mail klaarzetten in de gedeelde database.
  if (process.env.CRM_EXTERNAL_EFFECTS === "disabled") return [];
  const recipients = await tx.select({ id: users.id, role: users.role }).from(users).where(sql`lower(${users.email}) = ${NICK_FREDERIQUE[0]}`);
  const ids: string[] = [];
  for (const r of recipients) {
    if (!magModule(r.role, "projects") || !heeftCap(r.role, "schrijven")) continue;
    const rows = await tx.insert(staffNotifications).values({ eventKey: `worker-lump:${id}:${version}:${r.id}`, kind: "worker_week_submitted", entityId: id, userId: r.id })
      .onConflictDoNothing().returning({ id: staffNotifications.id });
    ids.push(...rows.map((x) => x.id));
  }
  return ids;
}

/** Goedkeuren = als inkoopfactuur (aanneemwerk, geen uren) op het project boeken. */
export async function reviewLumpInvoice(args: { id: string; projectId: string; version: number; userId: string; approve: boolean; reason: string }) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(lumps).where(and(eq(lumps.id, args.id), eq(lumps.projectId, args.projectId))).for("update");
    if (!l || l.version !== args.version || l.status !== "submitted") conflict("Deze factuur is al gewijzigd of beoordeeld. Vernieuw de pagina.");
    const inv = l!.invoice;
    let poId: string | null = null;
    if (args.approve) {
      const [dup] = await tx.select({ id: purchaseOrders.id }).from(purchaseOrders)
        .where(and(eq(purchaseOrders.reference, inv.number), sql`lower(trim(${purchaseOrders.supplier})) = ${inv.legalName.toLowerCase()}`)).limit(1);
      if (dup) conflict("Deze leverancier en dit factuurnummer staan al in Inkoop. Controleer de bestaande factuur.");
      const [po] = await tx.insert(purchaseOrders).values({ kind: "invoice", status: "received", supplier: inv.legalName, reference: inv.number,
        projectId: l!.projectId, countAsLabor: false, currency: "EUR", orderDate: inv.date, receivedAt: new Date(),
        subtotal: inv.subtotal.toFixed(2), tax: inv.vat.toFixed(2), total: inv.total.toFixed(2),
        items: [{ name: inv.concept ?? "Aanneemwerk", units: 1, unitPrice: inv.subtotal, note: "Onderaannemer — vaste prijs" }],
        notes: `Via urenportaal · losse factuur zonder uren (onderaannemer)\nLeverancier: ${inv.legalName} · NIF/NIE ${inv.taxId}${inv.iban ? ` · IBAN ${inv.iban}` : ""}${inv.withholding ? `\nIRPF ${inv.withholdingRate}%: − ${inv.withholding.toFixed(2)}` : ""}` })
        .returning({ id: purchaseOrders.id });
      poId = po.id;
    }
    await tx.update(lumps).set({ status: args.approve ? "approved" : "returned", purchaseOrderId: poId, reviewNote: args.reason || null,
      ...(args.approve ? { holdedSyncStatus: "pending", holdedSyncError: null } : {}),
      reviewedAt: new Date(), reviewedBy: args.userId, version: l!.version + 1, updatedAt: new Date() }).where(eq(lumps.id, l!.id));
  });
}
