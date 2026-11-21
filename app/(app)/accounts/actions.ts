"use server";

import { registrationSchema } from "@/lib/portal/registration-schema";
import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";

import { db } from "@/lib/db";
import { accountRequests, contacts, customerAccounts } from "@/lib/db/schema";
import { grantWindowsAccess } from "@/lib/portal/windows-access";
import { approveAccountRequestCore, newToken, sendActivationMail } from "@/lib/portal/approve-account";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireModule("klantaccounts");
}

function refreshAccountPages() {
  revalidatePath("/accounts");
  revalidatePath("/windows-accounts");
  revalidatePath("/contacts/[id]", "page");
}

/** Keur een accountaanvraag goed: maak/koppel contact + account, mail activatie. */
const approveSchema = z.object({ tier: z.enum(["particulier", "aannemer"]) });
export async function approveAccountRequest(requestId: string, formData: FormData) {
  await requireUser();
  const { tier } = approveSchema.parse(Object.fromEntries(formData));
  await approveAccountRequestCore(requestId, tier);
  refreshAccountPages();
}

/** Interne helper: maak een account voor een e-mail (+ optioneel contact) en mail activatie. */
async function createAccount(opts: {
  email: string;
  name: string;
  tier: "particulier" | "aannemer";
  contactId?: string | null;
  businessName?: string | null;
  vatNumber?: string | null;
  windows?: boolean;
  /** Taal van de activatiemail (voorkeurstaal van het contact). */
  locale?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  if (opts.windows && (!opts.businessName?.trim() || !opts.vatNumber?.trim())) throw new Error("Bedrijfsnaam en btw-nummer zijn verplicht.");
  const email = opts.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "geen e-mail" };
  const existing = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.email, email) });
  if (existing) return { ok: false, reason: "bestaat al" };
  const token = newToken();
  const [created] = await db.insert(customerAccounts).values({
    contactId: opts.contactId ?? null,
    email,
    priceTier: opts.tier,
    status: "pending",
    websiteAccess: !opts.windows,
    businessName: opts.businessName ?? null,
    vatNumber: opts.vatNumber ?? null,
    activationToken: token,
    activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).returning();
  if (opts.windows) await grantWindowsAccess(created);
  try {
    await sendActivationMail(email, opts.name, token, opts.tier, opts.windows ? "windows" : "website", opts.locale ?? null);
  } catch (err) {
    console.warn("[accounts] activatiemail mislukt:", err);
  }
  return { ok: true };
}

/** Handmatig een account aanmaken (op /accounts): kies een contact of vul een e-mail in. */
const manualSchema = z.object({
  contactId: z.string().optional(),
  email: z.string().trim().optional(),
  tier: z.enum(["particulier", "aannemer"]).default("particulier"),
  businessName: z.string().trim().optional(),
  vatNumber: z.string().trim().optional(),
});
export async function createAccountManually(formData: FormData) {
  await requireUser();
  const d = manualSchema.parse(Object.fromEntries(formData));
  const contactId = d.contactId && d.contactId.length === 36 ? d.contactId : null;
  let email = d.email?.trim() || "";
  let name = "";
  let businessName = d.businessName || null;
  let locale: string | null = null;
  if (contactId) {
    const c = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
    if (c) {
      email = email || c.email || "";
      name = c.name;
      businessName = businessName || c.name;
      locale = c.preferredLanguage;
    }
  }
  if (!email) throw new Error("Vul een e-mail in of kies een contact met e-mail.");
  await createAccount({ email, name: name || email, tier: d.tier, contactId, businessName, vatNumber: d.vatNumber || null, locale });
  refreshAccountPages();
}

/** Maak een account voor een bestaand contact (knop op contact-detail). */
export async function createAccountForContact(contactId: string, formData: FormData) {
  await requireUser();
  const tier = String(formData.get("tier") ?? "particulier") === "aannemer" ? "aannemer" : "particulier";
  const c = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!c?.email) throw new Error("Dit contact heeft geen e-mailadres.");
  const windows = formData.get("system") === "windows";
  const email = c.email.trim().toLowerCase();
  const matches = await db.query.customerAccounts.findMany({ where: or(eq(customerAccounts.contactId, contactId), sql`lower(${customerAccounts.email}) = ${email}`), limit: 2 });
  if (matches.length > 1) throw new Error("Er zijn meerdere mogelijke accounts. Controleer eerst de contactkoppeling bij Accounts.");
  const existing = matches[0];
  if (existing) {
    if (existing.contactId && existing.contactId !== contactId) throw new Error("Dit e-mailadres hoort bij een ander contact. Controleer eerst de koppeling bij Accounts.");
    if (!existing.contactId) {
      const linked = await db.update(customerAccounts).set({ contactId, updatedAt: new Date() }).where(and(eq(customerAccounts.id, existing.id), isNull(customerAccounts.contactId))).returning({ id: customerAccounts.id });
      if (!linked.length) throw new Error("De accountkoppeling is gewijzigd. Vernieuw de contactkaart.");
    }
    if (windows) {
      const businessName=String(formData.get("businessName") || existing.businessName || "").trim();
      const vatNumber=String(formData.get("vatNumber") || existing.vatNumber || "").trim();
      if(!businessName || !vatNumber) throw new Error("Bedrijfsnaam en btw-nummer zijn verplicht.");
      await db.update(customerAccounts).set({businessName,vatNumber,updatedAt:new Date()}).where(eq(customerAccounts.id,existing.id));
      await grantWindowsAccess({...existing,businessName,vatNumber});
    }
    else await db.update(customerAccounts).set({websiteAccess:true,updatedAt:new Date()}).where(eq(customerAccounts.id,existing.id));
  } else {
    await createAccount({ email, name: c.name, tier: windows ? "aannemer" : tier, contactId, businessName: windows ? String(formData.get("businessName") || "") : c.name, vatNumber: windows ? String(formData.get("vatNumber") || "") : null, windows, locale: c.preferredLanguage });
  }
  refreshAccountPages();
  revalidatePath(`/contacts/${contactId}`);
}

export async function rejectAccountRequest(requestId: string) {
  await requireUser();
  await db.update(accountRequests).set({ status: "rejected", updatedAt: new Date() }).where(eq(accountRequests.id, requestId));
  refreshAccountPages();
}

export async function setAccountTier(accountId: string, formData: FormData) {
  await requireUser();
  const tier = String(formData.get("tier") ?? "");
  if (tier !== "particulier" && tier !== "aannemer") return;
  await db.update(customerAccounts).set({ priceTier: tier, updatedAt: new Date() }).where(eq(customerAccounts.id, accountId));
  refreshAccountPages();
}

export async function setAccountStatus(accountId: string, status: "active" | "suspended") {
  await requireUser();
  await db.update(customerAccounts).set({ status, updatedAt: new Date() }).where(eq(customerAccounts.id, accountId));
  refreshAccountPages();
}

/** Stuur (opnieuw) een activatie-/wachtwoord-reset-link. */
async function sendAccountActivation(accountId: string, scope?: "website" | "windows") {
  await requireUser();
  const acc = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.id, accountId) });
  if (!acc) return;
  const token = newToken();
  await db
    .update(customerAccounts)
    .set({ activationToken: token, activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), updatedAt: new Date() })
    .where(eq(customerAccounts.id, accountId));
  try {
    const request = await db.query.accountRequests.findFirst({ where: and(eq(accountRequests.email, acc.email), eq(accountRequests.status, "approved")), orderBy: desc(accountRequests.updatedAt) });
    const contact = acc.contactId ? await db.query.contacts.findFirst({ where: eq(contacts.id, acc.contactId), columns: { preferredLanguage: true } }) : null;
    await sendActivationMail(acc.email, acc.businessName ?? acc.email, token, acc.priceTier, scope ?? (acc.websiteAccess ? "website" : "windows"), request?.locale ?? contact?.preferredLanguage ?? null);
  } catch (err) {
    console.warn("[accounts] activatiemail mislukt:", err);
  }
  refreshAccountPages();
}

/** Windows-toegang is afzonderlijk van de status van het website-account. */
export async function setWindowsAccess(accountId: string, enabled: boolean) {
  await requireUser();
  const account = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.id, accountId) });
  if (!account) throw new Error("Account niet gevonden");
  if (enabled) await grantWindowsAccess(account);
  else await db.execute(sql`update windows.dealers set access_approved_at = null, updated_at = now() where portal_account_id = ${accountId}`);
  refreshAccountPages();
}

/** Website-toegang wijzigen zonder Windows-rechten of het wachtwoord te wijzigen. */
export async function setWebsiteAccess(accountId:string,enabled:boolean) {
 await requireUser();
 await db.update(customerAccounts).set({websiteAccess:enabled,updatedAt:new Date()}).where(eq(customerAccounts.id,accountId));
 refreshAccountPages();
}

/** Nieuwe zakelijke klant: dezelfde gecontroleerde goedkeuringsflow als een aanvraag. */
export async function createWindowsCustomer(_state: { error?: string; success?: string }, formData: FormData): Promise<{error?:string;success?:string}> {
  await requireUser();
  const parsed = registrationSchema.safeParse({...Object.fromEntries(formData),source:"windows",kind:"zakelijk"});
  if (!parsed.success) return {error:"Vul naam, een geldig e-mailadres, bedrijfsnaam en btw-nummer in."};
  const v=parsed.data;
  const existing=await db.query.customerAccounts.findFirst({where:eq(customerAccounts.email,v.email.toLowerCase())});
  if(existing) return {error:"Dit e-mailadres heeft al een account. Geef Windows-toegang via de contactkaart, onder Online toegang."};
  const [request]=await db.insert(accountRequests).values({...v,email:v.email.toLowerCase()}).returning({id:accountRequests.id});
  const approval=new FormData(); approval.set("tier","aannemer");
  try { await approveAccountRequest(request.id,approval); }
  catch { refreshAccountPages(); return {error:"De aanvraag is opgeslagen, maar nog niet goedgekeurd. Controleer de aanvraag hieronder."}; }
  return {success:"Zakelijke klant aangemaakt en Windows-toegang goedgekeurd. De activatiemail is aangevraagd; website-toegang staat uit."};
}

export async function resendActivation(accountId: string) { await sendAccountActivation(accountId); }
export async function resendWindowsActivation(accountId: string) { await sendAccountActivation(accountId,"windows"); }
