"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";

import { db } from "@/lib/db";
import {
  bulkMailSettings,
  emailCampaigns,
  products,
  prospects,
} from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { buildCampaignEmail, type CampaignLang } from "@/lib/leads/campaign";
import { nogTeGaan, telOntvangers, vulWachtrij, vulWachtrijKlanten } from "@/lib/leads/queue";
import { runCampaignSend } from "@/lib/leads/send-runner";
import { bulkGereed } from "@/lib/leads/transport";
import { generateCampaignCopy } from "@/lib/leads/ai-copy";
import { groupHeroUrl, groupLabel, groupUrl, type CampaignGroup } from "@/lib/leads/groups";
import { searchPlaces, type PlaceCategory } from "@/lib/leads/places";
import { searchOverpass } from "@/lib/leads/overpass";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireModule("leads");
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

// De oude plak-CSV-import is weg. Die deed geen dedupe tegen contacten of de
// afmeldlijst, legde niet vast waar een lijst vandaan kwam, en schreef rij voor
// rij weg — bij 7.000 regels dus 7.000 losse queries. Het echte importpad staat
// in app/(app)/leads/import/.

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

/**
 * Hoeveel ontvangers krijgt deze campagne? Geteld in de database met dezelfde
 * voorwaarde die de wachtrij straks gebruikt, dus het getal op het scherm is
 * precies wat er verstuurd gaat worden.
 */
export async function countRecipients(campaignId: string): Promise<number> {
  await requireUser();
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  return c ? telOntvangers(c) : 0;
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

/**
 * De campagne in de wachtrij zetten. Dit is wat "verzenden" nu betekent.
 *
 * Voorheen stuurde één klik 60 mails via Gmail en moest je opnieuw klikken voor
 * de volgende 60. Bij 7.000 adressen is dat 117 keer klikken, op hetzelfde
 * postvak waar offertes en facturen uit gaan, en met een harde Gmail-grens rond
 * de 500 per dag. Nu gaan alle ontvangers als `queued` in
 * `campaign_recipients` en verstuurt de cron ze in porties via Resend, binnen
 * het verzendvenster en onder de dagcap.
 *
 * Twee keer in de wachtrij zetten is veilig: op (campaign_id, email) ligt een
 * unieke index. Nieuwe prospects sinds het vullen kun je er dus zo bij zetten.
 */
export async function queueCampaign(
  campaignId: string,
): Promise<{ ok: boolean; toegevoegd?: number; totaal?: number; error?: string }> {
  await requireUser();
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { ok: false, error: "Campagne niet gevonden." };
  if (!c.subject.trim()) return { ok: false, error: "Nog geen onderwerp — vul die eerst in of laat AI hem opstellen." };
  if (!bulkGereed()) return { ok: false, error: "Verzendkanaal niet ingesteld (RESEND_API_KEY ontbreekt)." };

  const prospectRijen = await vulWachtrij(c);
  const klantRijen = await vulWachtrijKlanten(c);
  const totaal = await nogTeGaan(campaignId);
  if (totaal === 0) {
    return { ok: false, error: "Geen ontvangers: alles is al gemaild, afgemeld, of valt buiten de frequentiecap." };
  }

  await db
    .update(emailCampaigns)
    .set({ status: "queued", queuedCount: totaal, updatedAt: sql`now()` })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/leads/campaigns/${campaignId}`);
  revalidatePath("/leads");
  return { ok: true, toegevoegd: prospectRijen + klantRijen, totaal };
}

/** Nu een ronde draaien in plaats van op de cron wachten. */
export async function runSendRoundNow(campaignId: string) {
  await requireUser();
  const r = await runCampaignSend();
  revalidatePath(`/leads/campaigns/${campaignId}`);
  return r;
}

/** Campagne pauzeren of weer starten. */
export async function setCampaignPaused(campaignId: string, paused: boolean) {
  await requireUser();
  await db
    .update(emailCampaigns)
    .set({ status: paused ? "paused" : "queued", updatedAt: sql`now()` })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/leads/campaigns/${campaignId}`);
}

/**
 * De noodstop: zet ál het campagneverzenden stil, ook lopende campagnes. Dit is
 * de knop voor "er gaat iets mis en ik wil dat het nú ophoudt".
 */
export async function setBulkPaused(paused: boolean) {
  await requireUser();
  await db
    .insert(bulkMailSettings)
    .values({ id: "default", paused, pausedReason: paused ? "Handmatig stilgezet." : null })
    .onConflictDoUpdate({
      target: bulkMailSettings.id,
      set: { paused, pausedReason: paused ? "Handmatig stilgezet." : null, updatedAt: sql`now()` },
    });
  revalidatePath("/leads");
}
