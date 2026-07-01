"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { accountRequests, contacts, customerAccounts } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
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
    const displayName = req.kind === "zakelijk" && req.businessName ? req.businessName : req.name;
    const [c] = await db
      .insert(contacts)
      .values({
        name: displayName,
        firstName: req.name || null,
        email: req.email,
        phone: req.phone,
        type: "customer",
        notes: [req.businessName && `Bedrijf: ${req.businessName}`, req.vatNumber && `IVA/BTW: ${req.vatNumber}`, req.address]
          .filter(Boolean)
          .join("\n") || null,
      })
      .returning({ id: contacts.id });
    contactId = c.id;
  }

  const token = newToken();
  await db.insert(customerAccounts).values({
    contactId,
    email: req.email.toLowerCase(),
    priceTier: tier,
    status: "pending",
    businessName: req.businessName,
    vatNumber: req.vatNumber,
    activationToken: token,
    activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await db.update(accountRequests).set({ status: "approved", contactId, updatedAt: new Date() }).where(eq(accountRequests.id, requestId));

  try {
    await sendActivationMail(req.email, req.name, token, tier);
  } catch (err) {
    console.warn("[accounts] activatiemail mislukt:", err);
  }
  revalidatePath("/accounts");
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
