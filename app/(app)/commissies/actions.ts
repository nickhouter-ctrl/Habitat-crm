"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { commissionEntries, referrals } from "@/lib/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

function pctOrDefault(v: unknown, dflt: number): string {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? String(n) : String(dflt);
}

const createSchema = z.object({
  referrerContactId: z.string().length(36),
  refereeContactId: z.string().length(36),
  scope: z.enum(["business", "particulier"]).default("business"),
  commissionPct: z.string().optional(),
  customerDiscountPct: z.string().optional(),
  note: z.string().trim().optional(),
});

/** Leg een aanbreng-relatie vast: referrer bracht referee binnen. */
export async function createReferral(formData: FormData) {
  await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  if (d.referrerContactId === d.refereeContactId) throw new Error("Aanbrenger en klant mogen niet hetzelfde zijn.");
  await db
    .insert(referrals)
    .values({
      referrerContactId: d.referrerContactId,
      refereeContactId: d.refereeContactId,
      scope: d.scope,
      commissionPct: pctOrDefault(d.commissionPct, d.scope === "particulier" ? 20 : 5),
      customerDiscountPct: pctOrDefault(d.customerDiscountPct, 0),
      note: d.note || null,
    })
    .onConflictDoNothing();
  revalidatePath("/commissies");
}

export async function updateReferral(id: string, formData: FormData) {
  await requireUser();
  const active = formData.get("active");
  await db
    .update(referrals)
    .set({
      commissionPct: pctOrDefault(formData.get("commissionPct"), 5),
      customerDiscountPct: pctOrDefault(formData.get("customerDiscountPct"), 0),
      active: active == null ? true : active === "on" || active === "true",
      updatedAt: new Date(),
    })
    .where(eq(referrals.id, id));
  revalidatePath("/commissies");
}

export async function toggleReferral(id: string, active: boolean) {
  await requireUser();
  await db.update(referrals).set({ active, updatedAt: new Date() }).where(eq(referrals.id, id));
  revalidatePath("/commissies");
}

export async function deleteReferral(id: string) {
  await requireUser();
  await db.delete(referrals).where(eq(referrals.id, id));
  revalidatePath("/commissies");
}

export async function setCommissionStatus(entryId: string, status: "pending" | "approved" | "paid") {
  await requireUser();
  await db.update(commissionEntries).set({ status, updatedAt: new Date() }).where(eq(commissionEntries.id, entryId));
  revalidatePath("/commissies");
}
