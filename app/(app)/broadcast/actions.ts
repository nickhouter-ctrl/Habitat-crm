"use server";

/**
 * E-mailmarketing: campagnes maken, testen, in de wachtrij zetten en het tempo
 * bepalen.
 *
 * Losgetrokken van `/leads`. Dat is niet alleen opruimen: het zijn twee
 * verschillende soorten werk. Bij Leads gaat het om bedrijven vínden en de
 * lijst schoonhouden; hier gaat het om wat je ze stuurt en wanneer. Ze hangen
 * aan elkaar via de prospectlijst, en verder niet.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { bulkMailSettings, emailCampaigns, products } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import { generateCampaignCopy } from "@/lib/leads/ai-copy";
import { buildCampaignEmail, type CampaignLang } from "@/lib/leads/campaign";
import { groupHeroUrl, groupLabel, groupUrl, type CampaignGroup } from "@/lib/leads/groups";
import { nogTeGaan, telOntvangers, vulWachtrij, vulWachtrijKlanten } from "@/lib/leads/queue";
import { runCampaignSend } from "@/lib/leads/send-runner";
import { bulkGereed } from "@/lib/leads/transport";
import { HARD_MAX } from "@/lib/leads/warmup";

async function requireUser() {
  return requireModule("broadcast");
}

/** Productgroepen met hun foto, zoals ze als tegels in de mail komen. */
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

export async function deleteCampaign(id: string) {
  await requireUser();
  // campaign_recipients hangt met ON DELETE CASCADE, dus die gaan mee.
  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
  revalidatePath("/broadcast");
  redirect("/broadcast");
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
  if (!name) redirect("/broadcast?error=campagne-onvolledig");

  const [row] = await db
    .insert(emailCampaigns)
    .values({ name, subject, introText, language, groups, audience: { categories, includeCustomers }, createdById: user.id })
    .returning({ id: emailCampaigns.id });
  redirect(`/broadcast/${row.id}`);
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
  revalidatePath(`/broadcast/${campaignId}`);
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
  revalidatePath(`/broadcast/${campaignId}`);
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
  revalidatePath(`/broadcast/${campaignId}`);
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
    revalidatePath(`/broadcast/${campaignId}`);
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
  revalidatePath(`/broadcast/${campaignId}`);
  revalidatePath("/broadcast");
  return { ok: true, toegevoegd: prospectRijen + klantRijen, totaal };
}

/** Nu een ronde draaien in plaats van op de cron wachten. */
export async function runSendRoundNow(campaignId: string) {
  await requireUser();
  const r = await runCampaignSend();
  revalidatePath(`/broadcast/${campaignId}`);
  return r;
}

/** Campagne pauzeren of weer starten. */
export async function setCampaignPaused(campaignId: string, paused: boolean) {
  await requireUser();
  await db
    .update(emailCampaigns)
    .set({ status: paused ? "paused" : "queued", updatedAt: sql`now()` })
    .where(eq(emailCampaigns.id, campaignId));
  revalidatePath(`/broadcast/${campaignId}`);
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
  revalidatePath("/broadcast");
}

/**
 * Het verzendtempo instellen. Bewust in de database en niet in de code: zo kan
 * dit zonder deploy omhoog of omlaag, en staat de keuze bij de mensen die de
 * campagne draaien.
 */
export async function setVerzendtempo(formData: FormData) {
  await requireUser();
  const ruw = String(formData.get("dailyCap") ?? "").trim();
  const cap = ruw === "" ? null : Math.max(0, Math.min(HARD_MAX, Number(ruw) || 0));
  const opnieuwOpwarmen = formData.get("opnieuwOpwarmen") === "on";

  await db
    .insert(bulkMailSettings)
    .values({ id: "default", dailyCapOverride: cap, warmupStartedAt: opnieuwOpwarmen ? null : undefined })
    .onConflictDoUpdate({
      target: bulkMailSettings.id,
      set: {
        dailyCapOverride: cap,
        ...(opnieuwOpwarmen ? { warmupStartedAt: null } : {}),
        updatedAt: sql`now()`,
      },
    });
  revalidatePath("/broadcast");
  revalidatePath("/broadcast", "layout");
}
