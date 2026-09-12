"use server";

import { registrationSchema } from "@/lib/portal/registration-schema";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { contactDisplayName } from "@/lib/contact-name";
import { db } from "@/lib/db";
import { accountRequests, companies, contacts, customerAccounts } from "@/lib/db/schema";
import { grantWindowsAccess } from "@/lib/portal/windows-access";
import { windowsActivationMail, windowsAccessReadyMail } from "@/lib/portal/windows-activation";
import { sendMail } from "@/lib/gmail";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

function refreshAccountPages() {
  revalidatePath("/accounts");
  revalidatePath("/windows-accounts");
  revalidatePath("/contacts/[id]", "page");
}

const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.habitat-one.com";

function newToken() {
  return randomBytes(24).toString("base64url");
}

async function sendActivationMail(email: string, name: string, token: string, tier: string, source = "website", locale: string | null = null) {
  if (source === "windows") {
    await sendMail({ to: email, ...windowsActivationMail(name, token, locale) });
    return;
  }
  const link = `${WEBSITE_URL}/account/activeren?token=${token}`;
  const tierText = tier === "aannemer" ? "zakelijk account" : "account";
  await sendMail({
    to: email,
    subject: "Je Habitat One-account is klaar — stel je wachtwoord in",
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a2620;max-width:560px">
  <h2 style="color:#402419;margin:0 0 12px">Welkom bij Habitat One</h2>
  <p>Beste ${name || "klant"},</p>
  <p>Je ${tierText} is aangemaakt. Stel hieronder je wachtwoord in om in te loggen en de prijzen te bekijken.</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#b5532b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px">Wachtwoord instellen</a></p>
  <p style="font-size:12px;color:#7a6a58">Deze link is 7 dagen geldig. Werkt de knop niet? Kopieer: ${link}</p>
</div>`,
    text: `Beste ${name || "klant"},\n\nJe account is aangemaakt. Stel je wachtwoord in via:\n${link}\n\n(7 dagen geldig)`,
  });
}

/** Keur een accountaanvraag goed: maak/koppel contact + account, mail activatie. */
const approveSchema = z.object({ tier: z.enum(["particulier", "aannemer"]) });
export async function approveAccountRequest(requestId: string, formData: FormData) {
  await requireUser();
  const { tier } = approveSchema.parse(Object.fromEntries(formData));
  const req = await db.query.accountRequests.findFirst({ where: eq(accountRequests.id, requestId) });
  if (!req || req.status !== "pending") return;
  if (req.source === "windows" && (req.kind !== "zakelijk" || !req.businessName?.trim() || !req.vatNumber?.trim())) throw new Error("Bedrijfsnaam en btw-nummer zijn verplicht voor Windows-toegang.");

  // Contact: hergebruik gekoppeld contact, anders aanmaken.
  const linkedAccount = await db.query.customerAccounts.findFirst({where: eq(customerAccounts.email, req.email.toLowerCase())});
  let contactId = req.contactId ?? linkedAccount?.contactId;
  if (!contactId) {
    const matches = await db.query.contacts.findMany({where: sql`lower(${contacts.email}) = ${req.email.toLowerCase()}`, limit: 2});
    if (matches.length > 1) throw new Error("Meerdere contacten met dit e-mailadres. Koppel eerst het juiste contact.");
    contactId = matches[0]?.id;
  }
  if (!contactId) {
    const isZakelijk = req.kind === "zakelijk";
    // Zakelijk → bedrijf aanmaken en koppelen. Het CRM leidt "zakelijk" af van
    // een gekoppeld bedrijf (companyId), en bedrijfsnaam/BTW horen in de
    // gestructureerde velden (companies.name / companies.vatNumber) — niet in
    // de vrije notitietekst. Zonder dit werd elk website-bedrijf als
    // particulier opgeslagen zonder bedrijfsnaam/BTW.
    let companyId: string | null = null;
    if (isZakelijk && req.businessName) {
      const [co] = await db
        .insert(companies)
        .values({
          name: req.businessName,
          type: "client",
          vatNumber: req.vatNumber || null,
          email: req.email || null,
          phone: req.phone || null,
          addressLine: req.address || null,
          country: "ES",
        })
        .returning({ id: companies.id });
      companyId = co.id;
    }
    const [first, ...rest] = (req.name || "").trim().split(/\s+/);
    const [c] = await db
      .insert(contacts)
      .values({
        name: contactDisplayName({
          firstName: req.name,
          companyName: req.businessName,
          email: req.email,
          isZakelijk,
        }),
        firstName: first || null,
        lastName: rest.join(" ") || null,
        email: req.email,
        phone: req.phone,
        type: "customer",
        companyId,
        addressLine: req.address || null,
        preferredLanguage: req.locale ?? undefined,
      })
      .returning({ id: contacts.id });
    contactId = c.id;
  }

  const email = req.email.toLowerCase();
  const token = newToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Idempotent: bestaat er al een account voor dit e-mailadres (bv. een eerdere
  // aanvraag of een half-afgeronde goedkeuring), dan hergebruiken we dat i.p.v.
  // een dubbele rij te forceren (email is uniek → zou de action laten crashen).
  const existingAccount = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.email, email),
  });
  if (existingAccount) {
    // Alleen een nieuwe activatielink uitgeven als het account nog niet actief
    // is; een al-actief account laten we met rust (geen wachtwoord-reset).
    if (existingAccount.status !== "active") {
      await db
        .update(customerAccounts)
        .set({
          contactId: existingAccount.contactId ?? contactId,
          priceTier: tier,
          activationToken: token,
          activationExpires: expires,
          updatedAt: new Date(),
        })
        .where(eq(customerAccounts.id, existingAccount.id));
    }
  } else {
    await db.insert(customerAccounts).values({
      contactId,
      email,
      priceTier: tier,
      status: "pending",
      websiteAccess: req.source !== "windows",
      businessName: req.businessName,
      vatNumber: req.vatNumber,
      activationToken: token,
      activationExpires: expires,
    });
  }
  if (req.source === "website" && existingAccount) await db.update(customerAccounts).set({websiteAccess:true,updatedAt:new Date()}).where(eq(customerAccounts.id,existingAccount.id));
  if (req.source === "windows") {
    const account = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.email, email) });
    if (!account) throw new Error("Account ontbreekt voor Windows-goedkeuring");
    await db.update(customerAccounts).set({businessName:req.businessName,vatNumber:req.vatNumber,updatedAt:new Date()}).where(eq(customerAccounts.id,account.id));
    await grantWindowsAccess({...account,businessName:req.businessName,vatNumber:req.vatNumber});
  }
  await db.update(accountRequests).set({ status: "approved", contactId, updatedAt: new Date() }).where(eq(accountRequests.id, requestId));

  if (req.source === "windows" && existingAccount?.status === "active") {
    try { await sendMail({ to: req.email, ...windowsAccessReadyMail(req.locale) }); }
    catch (err) { console.warn("[accounts] Windows-bevestiging mislukt:", err); }
  }
  // Activatiemail alleen sturen als er een verse (niet-actieve) link is.
  if (!existingAccount || existingAccount.status !== "active") {
    try {
      await sendActivationMail(req.email, req.name, token, tier, req.source, req.locale);
    } catch (err) {
      console.warn("[accounts] activatiemail mislukt:", err);
    }
  }
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
    await sendActivationMail(email, opts.name, token, opts.tier, opts.windows ? "windows" : "website");
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
  if (contactId) {
    const c = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
    if (c) {
      email = email || c.email || "";
      name = c.name;
      businessName = businessName || c.name;
    }
  }
  if (!email) throw new Error("Vul een e-mail in of kies een contact met e-mail.");
  await createAccount({ email, name: name || email, tier: d.tier, contactId, businessName, vatNumber: d.vatNumber || null });
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
    await createAccount({ email, name: c.name, tier: windows ? "aannemer" : tier, contactId, businessName: windows ? String(formData.get("businessName") || "") : c.name, vatNumber: windows ? String(formData.get("vatNumber") || "") : null, windows });
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
    await sendActivationMail(acc.email, acc.businessName ?? acc.email, token, acc.priceTier, scope ?? (acc.websiteAccess ? "website" : "windows"), request?.locale);
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
