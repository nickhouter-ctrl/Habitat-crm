import "server-only";

import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { contactDisplayName } from "@/lib/contact-name";
import { db } from "@/lib/db";
import { accountRequests, companies, contacts, customerAccounts } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { grantWindowsAccess } from "@/lib/portal/windows-access";
import { windowsActivationMail, windowsAccessReadyMail } from "@/lib/portal/windows-activation";
import { websiteActivationMail } from "@/lib/portal/website-activation";

/**
 * Goedkeuren van een accountaanvraag zonder sessiecontrole: gedeeld door de
 * knop in het CRM (die zelf de rechten controleert) en de autopilot-cron.
 */
const WEBSITE_URL = process.env.WEBSITE_URL || "https://www.habitat-one.com";

export function newToken() {
  return randomBytes(24).toString("base64url");
}

export async function sendActivationMail(email: string, name: string, token: string, tier: string, source = "website", locale: string | null = null) {
  if (source === "windows") {
    await sendMail({ to: email, ...windowsActivationMail(name, token, locale) });
    return;
  }
  // Taal van de aanvraag (of voorkeurstaal van het contact); onbekend → Engels.
  await sendMail({ to: email, ...websiteActivationMail({ name, token, tier, locale, baseUrl: WEBSITE_URL }) });
}

export async function approveAccountRequestCore(requestId: string, tier: "particulier" | "aannemer") {
  const req = await db.query.accountRequests.findFirst({ where: eq(accountRequests.id, requestId) });
  if (!req || req.status !== "pending") return { ok: false as const };
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
      const contact = !req.locale && contactId ? await db.query.contacts.findFirst({ where: eq(contacts.id, contactId), columns: { preferredLanguage: true } }) : null;
      await sendActivationMail(req.email, req.name, token, tier, req.source, req.locale ?? contact?.preferredLanguage ?? null);
    } catch (err) {
      console.warn("[accounts] activatiemail mislukt:", err);
    }
  }
  return { ok: true as const, contactId };
}

