"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  campaignRecipients,
  contacts,
  emailCampaigns,
  emailSuppressions,
  products,
  prospects,
} from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { buildCampaignEmail, unsubscribeUrl, type CampaignLang } from "@/lib/leads/campaign";
import { generateCampaignCopy } from "@/lib/leads/ai-copy";
import { groupHeroUrl, groupLabel, groupUrl, type CampaignGroup } from "@/lib/leads/groups";
import { signEmailToken } from "@/lib/leads/unsub-token";
import { searchPlaces, type PlaceCategory } from "@/lib/leads/places";
import { searchOverpass } from "@/lib/leads/overpass";

/** Max. aantal mails per verzendactie — deliverability + serverless-timeout. */
const SEND_CAP = 60;

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

function token() {
  return randomBytes(24).toString("base64url");
}

// ─── Bedrijven zoeken via Google Places + importeren als prospects ───────────
const searchSchema = z.object({
  source: z.enum(["osm", "places"]).default("osm"),
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
  radiusKm: z.coerce.number().min(0).max(50).optional(),
});

export async function searchAndImportProspects(formData: FormData) {
  await requireUser();
  const parsed = searchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/leads?error=zoekopdracht");
  const v = parsed.data;
  const useOsm = v.source === "osm";
  const onlyWithEmail = formData.get("onlyWithEmail") === "on";

  let found;
  try {
    const args = {
      category: v.category as PlaceCategory,
      region: v.region,
      freeText: v.freeText || undefined,
      radiusKm: v.radiusKm || undefined,
    };
    found = useOsm ? await searchOverpass(args) : await searchPlaces(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "onbekende fout";
    redirect(`/leads?error=${encodeURIComponent(msg)}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sourceLabel = useOsm ? "OpenStreetMap" : "Google Places";
  let added = 0;
  let skippedNoEmail = 0;
  for (const p of found) {
    if (onlyWithEmail && !p.email) {
      skippedNoEmail++;
      continue;
    }
    const [row] = await db
      .insert(prospects)
      .values({
        companyName: p.name,
        category: v.category,
        email: p.email ?? null,
        website: p.website ?? null,
        phone: p.phone ?? null,
        addressLine: p.address ?? null,
        source: useOsm ? "import" : "google-places",
        sourceRef: p.placeId,
        status: "new",
        lawfulBasisNote: `B2B gerechtvaardigd belang — via ${sourceLabel} (${v.category}) op ${today}, openbare bron`,
        unsubscribeToken: token(),
      })
      .onConflictDoNothing({ target: prospects.sourceRef })
      .returning({ id: prospects.id });
    if (row) added++;
  }
  revalidatePath("/leads");
  redirect(`/leads?added=${added}&found=${found.length}${skippedNoEmail ? `&noemail=${skippedNoEmail}` : ""}`);
}

/** Zoek alsnog e-mailadressen voor prospects zonder mail: heeft het bedrijf een
 *  website → scrapen; geen website → eerst de site opzoeken (DuckDuckGo), dan scrapen. */
export async function findMissingEmails(): Promise<{ ok: boolean; found: number; checked: number }> {
  await requireUser();
  const { extractEmailFromSite } = await import("@/lib/leads/places");
  const { findWebsite } = await import("@/lib/leads/websearch");
  const targets = await db.query.prospects.findMany({
    where: isNull(prospects.email),
    columns: { id: true, website: true, companyName: true, city: true },
    limit: 40,
  });
  let found = 0;
  for (const t of targets) {
    let website = t.website;
    if (!website) {
      website = await findWebsite(t.companyName, t.city ?? undefined);
      if (website) {
        await db.update(prospects).set({ website, updatedAt: sql`now()` }).where(eq(prospects.id, t.id)).catch(() => {});
      }
    }
    if (!website) continue;
    const email = await extractEmailFromSite(website);
    if (email) {
      await db
        .update(prospects)
        .set({ email, updatedAt: sql`now()` })
        .where(eq(prospects.id, t.id))
        .catch(() => {}); // uniek-conflict op e-mail → stil overslaan
      found++;
    }
  }
  revalidatePath("/leads");
  return { ok: true, found, checked: targets.length };
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

export async function deleteCampaign(id: string) {
  await requireUser();
  // campaign_recipients hangt met ON DELETE CASCADE, dus die gaan mee.
  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
  revalidatePath("/leads");
  redirect("/leads");
}

// ─── Campagne opstellen (concept) ────────────────────────────────────────────
export async function createCampaign(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const introText = String(formData.get("introText") ?? "").trim() || null;
  const groups = formData.getAll("groups").map(String).filter(Boolean);
  const categories = formData.getAll("categories").map(String).filter(Boolean);
  const includeCustomers = formData.get("includeCustomers") === "on";
  const langRaw = String(formData.get("language") ?? "es");
  const language = ["es", "nl", "de", "en"].includes(langRaw) ? langRaw : "es";
  if (!name) redirect("/leads?error=campagne-onvolledig");

  const [row] = await db
    .insert(emailCampaigns)
    .values({ name, subject, introText, language, groups, audience: { categories, includeCustomers }, createdById: user.id })
    .returning({ id: emailCampaigns.id });
  redirect(`/leads/campaigns/${row.id}`);
}

/** Productgroepen in de mailvorm: label + website-URL + representatieve foto. */
async function loadCampaignGroups(collections: string[], lang: string): Promise<CampaignGroup[]> {
  const out: CampaignGroup[] = [];
  for (const collection of collections) {
    const rep = await db.query.products.findFirst({
      where: and(eq(products.collection, collection), eq(products.isActive, true), isNotNull(products.imageUrl)),
      columns: { imageUrl: true },
    });
    out.push({
      collection,
      label: groupLabel(collection, lang),
      url: groupUrl(collection, lang),
      imageUrl: groupHeroUrl(collection) ?? rep?.imageUrl ?? null,
    });
  }
  return out;
}

type Recipient = { prospectId: string | null; email: string; companyName: string; unsubToken: string };

/** Ontvangers: prospects in de gekozen categorieën + optioneel bestaande klanten, met e-mail, niet afgemeld en niet op de suppressielijst. */
async function resolveRecipients(campaignId: string) {
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { campaign: null, recipients: [] as Recipient[] };
  const cats = (c.audience?.categories ?? []) as string[];

  // Suppressielijst.
  const suppressed = new Set(
    (await db.select({ email: emailSuppressions.email }).from(emailSuppressions)).map((s) => s.email.toLowerCase()),
  );
  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  // 1) Prospects.
  const rows = await db.query.prospects.findMany({
    where: and(
      isNotNull(prospects.email),
      cats.length ? inArray(prospects.category, cats as never) : undefined,
      inArray(prospects.status, ["new", "emailed"]),
    ),
    columns: { id: true, email: true, companyName: true, unsubscribeToken: true },
  });
  for (const r of rows) {
    const email = r.email!;
    const low = email.toLowerCase();
    if (suppressed.has(low) || seen.has(low)) continue;
    seen.add(low);
    recipients.push({ prospectId: r.id, email, companyName: r.companyName, unsubToken: r.unsubscribeToken });
  }

  // 2) Bestaande klanten (contacten met type customer) — soft opt-in, mét afmeldlink.
  if (c.audience?.includeCustomers) {
    const custs = await db.query.contacts.findMany({
      where: and(isNotNull(contacts.email), eq(contacts.type, "customer")),
      columns: { email: true, name: true },
    });
    for (const cu of custs) {
      const email = cu.email!;
      const low = email.toLowerCase();
      if (suppressed.has(low) || seen.has(low)) continue;
      seen.add(low);
      recipients.push({ prospectId: null, email, companyName: cu.name, unsubToken: signEmailToken(email) });
    }
  }

  return { campaign: c, recipients };
}

/** Aantal ontvangers (voor de reviewpagina). */
export async function countRecipients(campaignId: string): Promise<number> {
  await requireUser();
  const { recipients } = await resolveRecipients(campaignId);
  return recipients.length;
}

/** Stel met AI een onderwerp + introtekst op en sla die op de campagne op. */
export async function generateCopyForCampaign(
  campaignId: string,
  angle: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { ok: false, error: "Campagne niet gevonden." };
  const copy = await generateCampaignCopy({
    language: c.language,
    groupLabels: c.groups.map((g) => groupLabel(g, c.language)),
    audience: (c.audience?.categories ?? []) as string[],
    angle: angle?.trim() || null,
  });
  if (!copy) return { ok: false, error: "AI niet beschikbaar (ANTHROPIC_API_KEY?) of geen tekst — probeer opnieuw." };
  await db
    .update(emailCampaigns)
    .set({ subject: copy.subject, introText: copy.intro, updatedAt: sql`now()` })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/leads/campaigns/${campaignId}`);
  return { ok: true };
}

/** Zet 'ook naar bestaande klanten' aan/uit op een bestaande campagne. */
export async function setCampaignAudience(campaignId: string, formData: FormData) {
  await requireUser();
  const includeCustomers = formData.get("includeCustomers") === "on";
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return;
  const categories = (c.audience?.categories ?? []) as string[];
  await db
    .update(emailCampaigns)
    .set({ audience: { categories, includeCustomers }, updatedAt: sql`now()` })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/leads/campaigns/${campaignId}`);
}

/** Handmatig het onderwerp/de introtekst aanpassen. */
export async function updateCampaignCopy(campaignId: string, formData: FormData) {
  await requireUser();
  const subject = String(formData.get("subject") ?? "").trim();
  const introText = String(formData.get("introText") ?? "").trim() || null;
  await db
    .update(emailCampaigns)
    .set({ subject, introText, updatedAt: sql`now()` })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/leads/campaigns/${campaignId}`);
}

/** Stuur een testmail naar de ingelogde gebruiker (of Nick) om te controleren. */
export async function sendTestEmail(campaignId: string): Promise<{ ok: boolean; to?: string; error?: string }> {
  const user = await requireUser();
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { ok: false, error: "Campagne niet gevonden." };
  if (!c.subject.trim()) return { ok: false, error: "Nog geen onderwerp — genereer of vul die eerst in." };
  const to = user.email || "nick@habitat-one.com";
  const groupsForMail = await loadCampaignGroups(c.groups, c.language);
  const { html, text } = buildCampaignEmail({
    lang: c.language as CampaignLang,
    subject: c.subject,
    introText: c.introText,
    groups: groupsForMail,
    unsubToken: "TEST",
    companyName: "Empresa Ejemplo S.L.",
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
  if (!campaign.subject.trim()) return { ok: false, error: "Nog geen onderwerp — genereer of vul die eerst in." };

  const batch = recipients.slice(0, SEND_CAP);
  const groupsForMail = await loadCampaignGroups(campaign.groups, campaign.language);
  await db.update(emailCampaigns).set({ status: "sending", updatedAt: sql`now()` }).where(eq(emailCampaigns.id, campaignId));

  let sent = 0;
  for (const r of batch) {
    const { html, text } = buildCampaignEmail({
      lang: campaign.language as CampaignLang,
      subject: campaign.subject,
      introText: campaign.introText,
      groups: groupsForMail,
      unsubToken: r.unsubToken,
      companyName: r.companyName,
    });
    try {
      const info = await sendMail({
        to: r.email,
        subject: campaign.subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl(r.unsubToken)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await db
        .insert(campaignRecipients)
        .values({ campaignId, prospectId: r.prospectId, email: r.email, status: "sent", messageId: info.messageId })
        .onConflictDoNothing({ target: [campaignRecipients.campaignId, campaignRecipients.email] });
      if (r.prospectId) {
        await db.update(prospects).set({ status: "emailed", lastEmailedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(prospects.id, r.prospectId));
      }
      sent++;
    } catch (err) {
      await db
        .insert(campaignRecipients)
        .values({ campaignId, prospectId: r.prospectId, email: r.email, status: "failed", error: err instanceof Error ? err.message : "fout" })
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
