"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { contactDisplayName } from "@/lib/contact-name";
import { db } from "@/lib/db";
import { accountRequests, companies, contacts, customerAccounts } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.habitat-one.com";

function newToken() {
  return randomBytes(24).toString("base64url");
}

async function sendActivationMail(email: string, name: string, token: string, tier: string) {
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

  // Contact: hergebruik gekoppeld contact, anders aanmaken.
  let contactId = req.contactId;
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
      businessName: req.businessName,
      vatNumber: req.vatNumber,
      activationToken: token,
      activationExpires: expires,
    });
  }
  await db.update(accountRequests).set({ status: "approved", contactId, updatedAt: new Date() }).where(eq(accountRequests.id, requestId));

  // Activatiemail alleen sturen als er een verse (niet-actieve) link is.
  if (!existingAccount || existingAccount.status !== "active") {
    try {
      await sendActivationMail(req.email, req.name, token, tier);
    } catch (err) {
      console.warn("[accounts] activatiemail mislukt:", err);
    }
  }
  revalidatePath("/accounts");
}

/** Interne helper: maak een account voor een e-mail (+ optioneel contact) en mail activatie. */
async function createAccount(opts: {
  email: string;
  name: string;
  tier: "particulier" | "aannemer";
  contactId?: string | null;
  businessName?: string | null;
  vatNumber?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "geen e-mail" };
  const existing = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.email, email) });
  if (existing) return { ok: false, reason: "bestaat al" };
  const token = newToken();
  await db.insert(customerAccounts).values({
    contactId: opts.contactId ?? null,
    email,
    priceTier: opts.tier,
    status: "pending",
    businessName: opts.businessName ?? null,
    vatNumber: opts.vatNumber ?? null,
    activationToken: token,
    activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  try {
    await sendActivationMail(email, opts.name, token, opts.tier);
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
  revalidatePath("/accounts");
}

/** Maak een account voor een bestaand contact (knop op contact-detail). */
export async function createAccountForContact(contactId: string, formData: FormData) {
  await requireUser();
  const tier = String(formData.get("tier") ?? "particulier") === "aannemer" ? "aannemer" : "particulier";
  const c = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!c?.email) throw new Error("Dit contact heeft geen e-mailadres.");
  await createAccount({ email: c.email, name: c.name, tier, contactId, businessName: c.name });
  revalidatePath("/accounts");
  revalidatePath(`/contacts/${contactId}`);
}

export async function rejectAccountRequest(requestId: string) {
  await requireUser();
  await db.update(accountRequests).set({ status: "rejected", updatedAt: new Date() }).where(eq(accountRequests.id, requestId));
  revalidatePath("/accounts");
}

export async function setAccountTier(accountId: string, formData: FormData) {
  await requireUser();
  const tier = String(formData.get("tier") ?? "");
  if (tier !== "particulier" && tier !== "aannemer") return;
  await db.update(customerAccounts).set({ priceTier: tier, updatedAt: new Date() }).where(eq(customerAccounts.id, accountId));
  revalidatePath("/accounts");
}

export async function setAccountStatus(accountId: string, status: "active" | "suspended") {
  await requireUser();
  await db.update(customerAccounts).set({ status, updatedAt: new Date() }).where(eq(customerAccounts.id, accountId));
  revalidatePath("/accounts");
}

/** Stuur (opnieuw) een activatie-/wachtwoord-reset-link. */
export async function resendActivation(accountId: string) {
  await requireUser();
  const acc = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.id, accountId) });
  if (!acc) return;
  const token = newToken();
  await db
    .update(customerAccounts)
    .set({ activationToken: token, activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), updatedAt: new Date() })
    .where(eq(customerAccounts.id, accountId));
  try {
    await sendActivationMail(acc.email, acc.businessName ?? acc.email, token, acc.priceTier);
  } catch (err) {
    console.warn("[accounts] activatiemail mislukt:", err);
  }
  revalidatePath("/accounts");
}
