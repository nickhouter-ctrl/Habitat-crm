"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activities, contacts, presentationAgreements as agreements, presentationRedemptions as redemptions } from "@/lib/db/schema";
import { cents, euros, presentationSchema, presentationAmounts, redemptionLimit } from "@/lib/presentation";
export type Result = { error?: string; success?: string };
class ValidationError extends Error {}
const fail = (message: string): never => { throw new ValidationError(message); };
function resultError(e: unknown): Result {
  if (e instanceof ValidationError) return { error: e.message };
  console.warn("[presentation] Opslaan mislukt");
  return { error: "Opslaan is niet gelukt. Vernieuw de pagina en probeer opnieuw." };
}
function refresh(id: string) {
  revalidatePath(`/wederverkopers/${id}/presentatie`);
  revalidatePath(`/wederverkopers/${id}`);
}
export async function savePresentation(_: Result, form: FormData): Promise<Result> {
  const user = await requireModule("producten");
  const parsed = presentationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const amounts = presentationAmounts(d);
  try {
    await db.transaction(async tx => {
      // Het contact is het slot, ook bij de eerste afspraak (nog geen rij).
      const [contact] = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, d.contactId)).for("update");
      if (!contact) fail("Contact niet gevonden.");
      const [old] = await tx.select().from(agreements).where(eq(agreements.contactId, d.contactId)).for("update");
      if ((old?.version ?? 0) !== d.version) fail("De afspraak is ondertussen gewijzigd. Vernieuw de pagina.");
      const entries = old ? await tx.select().from(redemptions).where(and(eq(redemptions.agreementId, old.id), isNull(redemptions.voidedAt))) : [];
      const used = entries.reduce((sum, r) => sum + cents(r.amountEur), 0);
      if (used > amounts.credit) fail("Het nieuwe tegoed is lager dan de geregistreerde verrekeningen.");
      if (used > 0 && old && (d.mode !== old.mode || d.value !== cents(old.valueEur) || d.paid < amounts.charge || d.rate !== Number(old.rate) || d.remainder !== old.remainder)) fail("Na een verrekening blijven regeling, tegoed en verrekenmethode vast. Corrigeer zo nodig eerst de verrekeningen.");
      const values = { title: d.title, mode: d.mode, valueEur: euros(d.value), contributionEur: euros(amounts.contribution), costEur: d.cost === null ? null : euros(d.cost), paidEur: euros(d.paid), rate: String(d.mode === "spread" ? d.rate : 0), minimumOrderEur: euros(d.minimumOrder), remainder: d.remainder, expiresOn: d.expires || null, terms: d.terms, approvedBy: user.id, version: d.version + 1, updatedAt: new Date() };
      if (old) await tx.update(agreements).set(values).where(eq(agreements.id, old.id));
      else await tx.insert(agreements).values({ ...values, contactId: d.contactId });
      await tx.insert(activities).values({ type: "note", contactId: d.contactId, authorId: user.id, subject: "Presentatieafspraak vastgelegd", body: JSON.stringify({ before: old ?? null, after: values }) });
    });
    refresh(d.contactId);
    return { success: "Presentatieafspraak opgeslagen." };
  } catch (e) { return resultError(e); }
}
const bookingSchema = z.object({ contactId: z.string().uuid(), agreementId: z.string().uuid(), reference: z.string().trim().min(2).max(160), order: z.string(), amount: z.string(), note: z.string().trim().max(2000), confirmed: z.literal("on") });
export async function bookRedemption(_: Result, form: FormData): Promise<Result> {
  const user = await requireModule("producten");
  const parsed = bookingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Vul de referentie in en bevestig dat de korting al op de order/factuur is verwerkt." };
  const d = parsed.data;
  let amount: number, order: number;
  try { amount = cents(d.amount); order = cents(d.order); } catch { return { error: "Controleer de bedragen." }; }
  try {
    await db.transaction(async tx => {
      const [a] = await tx.select().from(agreements).where(and(eq(agreements.id, d.agreementId), eq(agreements.contactId, d.contactId))).for("update");
      if (!a) fail("Afspraak niet gevonden bij dit contact.");
      const entries = await tx.select().from(redemptions).where(and(eq(redemptions.agreementId, a.id), isNull(redemptions.voidedAt)));
      if (entries.some(r => r.reference === d.reference.toUpperCase())) fail("Deze order/factuur is al geregistreerd. Corrigeer eerst de eerdere boeking.");
      const used = entries.reduce((sum, r) => sum + cents(r.amountEur), 0);
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
      let limit: number;
      try { limit = redemptionLimit({ mode: a.mode, credit: cents(a.valueEur), used, paid: cents(a.paidEur), charge: cents(a.valueEur) - cents(a.contributionEur), rate: Number(a.rate), minimum: cents(a.minimumOrderEur), remainder: a.remainder, expires: a.expiresOn }, order, today); } catch (e) { return fail((e as Error).message); }
      if (amount <= 0 || amount > limit) fail(`Deze verrekening mag maximaal € ${euros(limit)} bedragen.`);
      if (a.mode === "first_order" && amount !== limit) fail(`Verreken het volledige beschikbare bedrag: € ${euros(limit)}.`);
      await tx.insert(redemptions).values({ agreementId: a.id, reference: d.reference.toUpperCase(), orderEur: euros(order), amountEur: euros(amount), bookedOn: today, note: d.note || null, createdBy: user.id });
      await tx.insert(activities).values({ type: "note", contactId: d.contactId, authorId: user.id, subject: "Presentatietegoed verrekend", body: `€ ${euros(amount)} op ${d.reference.toUpperCase()}. ${d.note}` });
    });
    refresh(d.contactId);
    return { success: "Verrekening geregistreerd. De factuur zelf is niet gewijzigd." };
  } catch (e) { return resultError(e); }
}
export async function voidRedemption(_: Result, form: FormData): Promise<Result> {
  const user = await requireModule("producten");
  const parsed = z.object({ contactId: z.string().uuid(), agreementId: z.string().uuid(), entryId: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Geef een reden voor de correctie (minimaal vijf tekens)." };
  const d = parsed.data;
  try {
    await db.transaction(async tx => {
      const [a] = await tx.select().from(agreements).where(and(eq(agreements.id, d.agreementId), eq(agreements.contactId, d.contactId))).for("update");
      if (!a) fail("Afspraak niet gevonden bij dit contact.");
      const [entry] = await tx.update(redemptions).set({ voidedAt: new Date(), voidedBy: user.id, voidReason: d.reason }).where(and(eq(redemptions.id, d.entryId), eq(redemptions.agreementId, a.id), isNull(redemptions.voidedAt))).returning();
      if (!entry) fail("Deze boeking is al gecorrigeerd of bestaat niet.");
      await tx.insert(activities).values({ type: "note", contactId: d.contactId, authorId: user.id, subject: "Presentatieverrekening teruggedraaid", body: `${entry.reference}: € ${entry.amountEur}. ${d.reason}` });
    });
    refresh(d.contactId);
    return { success: "Boeking teruggedraaid; het tegoed is hersteld. Controleer ook de bijbehorende factuur." };
  } catch (e) { return resultError(e); }
}
