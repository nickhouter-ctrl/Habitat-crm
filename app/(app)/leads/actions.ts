"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  campaignRecipients,
  emailCampaigns,
  emailSuppressions,
  products,
  prospects,
} from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { buildCampaignEmail, unsubscribeUrl, type CampaignProduct } from "@/lib/leads/campaign";
import { searchPlaces, type PlaceCategory } from "@/lib/leads/places";

/** Max. aantal mails per verzendactie — deliverability + serverless-timeout. */
const SEND_CAP = 60;

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

function token() {
  return randomBytes(24).toString("base64url");
}

// ─── Bedrijven zoeken via Google Places + importeren als prospects ───────────
const searchSchema = z.object({
  category: z.enum([
    "architect",
    "aannemer",
    "makelaar",
    "interieur",
    "projectontwikkelaar",
    "hovenier",
    "overig",
  ]),
  region: z.string().trim().min(1).max(120),
  freeText: z.string().trim().max(160).optional().or(z.literal("")),
});

export async function searchAndImportProspects(formData: FormData) {
  await requireUser();
  const parsed = searchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/leads?error=zoekopdracht");
  const v = parsed.data;

  let found;
  try {
    found = await searchPlaces({ category: v.category as PlaceCategory, region: v.region, freeText: v.freeText || undefined });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "onbekende fout";
    redirect(`/leads?error=${encodeURIComponent(msg)}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const p of found) {
    const [row] = await db
      .insert(prospects)
      .values({
        companyName: p.name,
        category: v.category,
        email: p.email ?? null,
        website: p.website ?? null,
        phone: p.phone ?? null,
        addressLine: p.address ?? null,
        source: "google-places",
        sourceRef: p.placeId,
        status: "new",
        lawfulBasisNote: `B2B gerechtvaardigd belang — via Google Places (${v.category}) op ${today}, openbare bron`,
        unsubscribeToken: token(),
      })
      .onConflictDoNothing({ target: prospects.sourceRef })
      .returning({ id: prospects.id });
    if (row) added++;
  }
  revalidatePath("/leads");
  redirect(`/leads?added=${added}&found=${found.length}`);
}

// ─── CSV-import (naam,email,website,telefoon,plaats) ──────────────────────────
export async function importCsv(formData: FormData) {
  await requireUser();
  const category = String(formData.get("category") ?? "overig") as PlaceCategory;
  const raw = String(formData.get("csv") ?? "").trim();
  if (!raw) redirect("/leads?error=leeg");
  let added = 0;
  for (const line of raw.split("\n")) {
    const [name, email, website, phone, city] = line.split(/[,;\t]/).map((s) => s?.trim());
    if (!name) continue;
    const [row] = await db
      .insert(prospects)
      .values({
        companyName: name,
        category,
        email: email || null,
        website: website || null,
        phone: phone || null,
        city: city || null,
        source: "import",
        status: "new",
        lawfulBasisNote: `B2B gerechtvaardigd belang — geïmporteerde lijst op ${new Date().toISOString().slice(0, 10)}`,
        unsubscribeToken: token(),
      })
      .onConflictDoNothing({ target: prospects.email })
      .returning({ id: prospects.id });
    if (row) added++;
  }
  revalidatePath("/leads");
  redirect(`/leads?added=${added}`);
}

export async function deleteProspect(id: string) {
  await requireUser();
  await db.delete(prospects).where(eq(prospects.id, id));
  revalidatePath("/leads");
}

// ─── Campagne opstellen (concept) ────────────────────────────────────────────
export async function createCampaign(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const introText = String(formData.get("introText") ?? "").trim() || null;
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  const categories = formData.getAll("categories").map(String).filter(Boolean);
  if (!name || !subject) redirect("/leads?error=campagne-onvolledig");

  const [row] = await db
    .insert(emailCampaigns)
    .values({ name, subject, introText, productIds, audience: { categories }, createdById: user.id })
    .returning({ id: emailCampaigns.id });
  redirect(`/leads/campaigns/${row.id}`);
}

/** Actieve producten uit een lijst id's, in de vorm die de mail nodig heeft. */
async function loadCampaignProducts(ids: string[]): Promise<CampaignProduct[]> {
  if (ids.length === 0) return [];
  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { name: true, imageUrl: true, collection: true },
  });
  return rows.map((r) => ({ name: r.name, imageUrl: r.imageUrl, collection: r.collection }));
}

/** Ontvangers: prospects in de gekozen categorieën, met e-mail, niet afgemeld/bounced en niet op de suppressielijst. */
async function resolveRecipients(campaignId: string) {
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { campaign: null, recipients: [] as Array<{ id: string; email: string; companyName: string; unsubscribeToken: string }> };
  const cats = (c.audience?.categories ?? []) as string[];

  const rows = await db.query.prospects.findMany({
    where: and(
      isNotNull(prospects.email),
      cats.length ? inArray(prospects.category, cats as never) : undefined,
      inArray(prospects.status, ["new", "emailed"]),
    ),
    columns: { id: true, email: true, companyName: true, unsubscribeToken: true },
  });

  // Suppressielijst eruit filteren.
  const suppressed = new Set(
    (await db.select({ email: emailSuppressions.email }).from(emailSuppressions)).map((s) => s.email.toLowerCase()),
  );
  const recipients = rows
    .filter((r): r is typeof r & { email: string } => !!r.email && !suppressed.has(r.email.toLowerCase()))
    .map((r) => ({ id: r.id, email: r.email, companyName: r.companyName, unsubscribeToken: r.unsubscribeToken }));
  return { campaign: c, recipients };
}

/** Aantal ontvangers (voor de reviewpagina). */
export async function countRecipients(campaignId: string): Promise<number> {
  await requireUser();
  const { recipients } = await resolveRecipients(campaignId);
  return recipients.length;
}

/** Stuur een testmail naar de ingelogde gebruiker (of Nick) om te controleren. */
export async function sendTestEmail(campaignId: string): Promise<{ ok: boolean; to?: string; error?: string }> {
  const user = await requireUser();
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { ok: false, error: "Campagne niet gevonden." };
  const to = user.email || "nick@habitat-one.com";
  const productsForMail = await loadCampaignProducts(c.productIds);
  const { html, text } = buildCampaignEmail({
    introText: c.introText,
    products: productsForMail,
    unsubToken: "TEST",
    companyName: "Voorbeeldbedrijf BV",
  });
  try {
    await sendMail({ to, subject: `[TEST] ${c.subject}`, html, text });
    await db.update(emailCampaigns).set({ testSentAt: sql`now()`, updatedAt: sql`now()` }).where(eq(emailCampaigns.id, campaignId));
    revalidatePath(`/leads/campaigns/${campaignId}`);
    return { ok: true, to };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "versturen mislukt" };
  }
}

/** Verstuur de campagne echt naar de prospects (na bevestiging in de UI). */
export async function sendCampaign(campaignId: string): Promise<{ ok: boolean; sent?: number; remaining?: number; error?: string }> {
  await requireUser();
  const { campaign, recipients } = await resolveRecipients(campaignId);
  if (!campaign) return { ok: false, error: "Campagne niet gevonden." };
  if (recipients.length === 0) return { ok: false, error: "Geen ontvangers (met e-mail, niet afgemeld)." };

  const batch = recipients.slice(0, SEND_CAP);
  const productsForMail = await loadCampaignProducts(campaign.productIds);
  await db.update(emailCampaigns).set({ status: "sending", updatedAt: sql`now()` }).where(eq(emailCampaigns.id, campaignId));

  let sent = 0;
  for (const r of batch) {
    const { html, text } = buildCampaignEmail({
      introText: campaign.introText,
      products: productsForMail,
      unsubToken: r.unsubscribeToken,
      companyName: r.companyName,
    });
    try {
      const info = await sendMail({
        to: r.email,
        subject: campaign.subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl(r.unsubscribeToken)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await db
        .insert(campaignRecipients)
        .values({ campaignId, prospectId: r.id, email: r.email, status: "sent", messageId: info.messageId })
        .onConflictDoNothing({ target: [campaignRecipients.campaignId, campaignRecipients.email] });
      await db.update(prospects).set({ status: "emailed", lastEmailedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(prospects.id, r.id));
      sent++;
    } catch (err) {
      await db
        .insert(campaignRecipients)
        .values({ campaignId, prospectId: r.id, email: r.email, status: "failed", error: err instanceof Error ? err.message : "fout" })
        .onConflictDoNothing({ target: [campaignRecipients.campaignId, campaignRecipients.email] });
    }
  }

  const remaining = recipients.length - batch.length;
  await db
    .update(emailCampaigns)
    .set({
      status: remaining > 0 ? "sending" : "sent",
      sentCount: sql`${emailCampaigns.sentCount} + ${sent}`,
      sentAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/leads/campaigns/${campaignId}`);
  revalidatePath("/leads");
  return { ok: true, sent, remaining };
}
