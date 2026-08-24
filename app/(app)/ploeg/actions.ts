"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { timeEntries, workers } from "@/lib/db/schema";
import { moneyOrNull } from "@/lib/parse-money";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

// Zie lib/parse-money.ts: "28.000000" is 28, geen 28 miljoen.

const workerSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  role: z.string().trim().optional(),
  /** Tarief bij betaling per factuur. */
  hourlyCostEur: z.string().trim().optional(),
  /** Tarief bij contante betaling; leeg = zelfde als per factuur. */
  hourlyCostCashEur: z.string().trim().optional(),
  defaultPaymentMethod: z.enum(["cash", "invoice"]).default("invoice"),
  portalLang: z.enum(["nl", "es", "en"]).default("es"),
  notes: z.string().trim().optional(),
});

export async function createWorker(formData: FormData) {
  await requireUser();
  const parsed = workerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db.insert(workers).values({
    name: d.name,
    role: d.role || null,
    hourlyCostEur: moneyOrNull(d.hourlyCostEur),
    hourlyCostCashEur: moneyOrNull(d.hourlyCostCashEur),
    defaultPaymentMethod: d.defaultPaymentMethod,
    portalLang: d.portalLang,
    notes: d.notes || null,
  });
  revalidatePath("/ploeg");
}

export async function updateWorker(id: string, formData: FormData) {
  await requireUser();
  const parsed = workerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db
    .update(workers)
    .set({
      name: d.name,
      role: d.role || null,
      hourlyCostEur: moneyOrNull(d.hourlyCostEur),
      hourlyCostCashEur: moneyOrNull(d.hourlyCostCashEur),
      defaultPaymentMethod: d.defaultPaymentMethod,
      portalLang: d.portalLang,
      notes: d.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(workers.id, id));
  revalidatePath("/ploeg");
  revalidatePath(`/ploeg/${id}`);
}

export async function toggleWorkerActive(id: string, active: boolean) {
  await requireUser();
  await db.update(workers).set({ active, updatedAt: new Date() }).where(eq(workers.id, id));
  revalidatePath("/ploeg");
  revalidatePath(`/ploeg/${id}`);
}


/**
 * Betaalwijze van één urenregel omzetten: contant ⇄ per factuur.
 *
 * Hoe iets is afgerekend staat nergens in de gegevens — een factuur kan contant
 * betaald zijn en andersom. Het uit de herkomst van de regel afleiden ging twee
 * keer mis; dit is de plek waar het gewoon gezet kan worden.
 */
export async function toggleTimeEntryPayment(workerId: string, entryId: string, naar: "cash" | "invoice") {
  await requireUser();
  await db
    .update(timeEntries)
    .set({ paymentMethod: naar, updatedAt: new Date() })
    .where(eq(timeEntries.id, entryId));
  revalidatePath(`/ploeg/${workerId}`);
}

/** Alles wat aan één inkoopfactuur hangt in één keer omzetten — je rekent een
 *  factuur immers in zijn geheel af, niet per regel. */
export async function setInvoicePayment(workerId: string, purchaseOrderId: string, naar: "cash" | "invoice") {
  await requireUser();
  await db
    .update(timeEntries)
    .set({ paymentMethod: naar, updatedAt: new Date() })
    .where(and(eq(timeEntries.purchaseOrderId, purchaseOrderId), isNull(timeEntries.selfLoggedAt)));
  revalidatePath(`/ploeg/${workerId}`);
}
