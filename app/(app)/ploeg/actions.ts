"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workers } from "@/lib/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

/** Bedrag-string normaliseren (NL-komma → punt); leeg → null. */
function moneyOrNull(v?: string): string | null {
  const s = (v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

const workerSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  role: z.string().trim().optional(),
  hourlyCostEur: z.string().trim().optional(),
  defaultPaymentMethod: z.enum(["cash", "invoice"]).default("cash"),
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
      defaultPaymentMethod: d.defaultPaymentMethod,
      portalLang: d.portalLang,
      notes: d.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(workers.id, id));
  revalidatePath("/ploeg");
}

export async function toggleWorkerActive(id: string, active: boolean) {
  await requireUser();
  await db.update(workers).set({ active, updatedAt: new Date() }).where(eq(workers.id, id));
  revalidatePath("/ploeg");
}

