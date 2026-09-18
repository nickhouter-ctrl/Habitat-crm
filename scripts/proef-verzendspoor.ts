/**
 * Proef op het verzendspoor: wachtrij vullen, een ronde draaien, controleren wat
 * er gebeurde, en alles opruimen.
 *
 * VERSTUURT ECHTE MAIL — alleen naar onze eigen adressen. Draaien met:
 *
 *     npx tsx scripts/proef-verzendspoor.ts --ja
 *
 * Drie sloten, want hier is het één keer misgegaan. De eerste versie koos
 * "architecten" als doelgroep, en dat waren niet alleen de testadressen maar ook
 * twee echte bureaus uit de prospectlijst; die kregen een proefmail.
 *
 *  1. de testprospects krijgen een categorie waarin geen echte prospect met
 *     e-mailadres zit, en de campagne richt zich alleen op die categorie;
 *  2. vóór het versturen wordt geëist dat de wachtrij uitsluitend onze eigen
 *     adressen bevat;
 *  3. CAMPAIGN_ALLOWED_DOMAINS in .env.local laat het transport zelf niets
 *     buiten habitat-one.com door.
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bulkMailSettings, campaignRecipients, emailCampaigns, prospects } from "@/lib/db/schema";
import { nogTeGaan, telOntvangers, vulWachtrij, wachtrijStand } from "@/lib/leads/queue";
import { runCampaignSend } from "@/lib/leads/send-runner";
import { bulkGereed } from "@/lib/leads/transport";

const TEST_ADRESSEN = ["nick@habitat-one.com", "hi@habitat-one.com", "teresa@habitat-one.com"];

/**
 * De eerste versie van dit script koos "architecten" als doelgroep, en dat
 * waren niet alleen de testadressen maar ook twee echte bureaus. Nu twee
 * sloten: CAMPAIGN_ALLOWED_DOMAINS in het transport, en hier een controle dat
 * de wachtrij écht alleen onze eigen adressen bevat.
 */
function eisAlleenEigenAdressen(rijen: { email: string }[]) {
  const vreemd = rijen.filter((r) => !TEST_ADRESSEN.includes(r.email.toLowerCase()));
  if (vreemd.length) {
    throw new Error(`GESTOPT: de wachtrij bevat adressen die niet van ons zijn: ${vreemd.map((v) => v.email).join(", ")}`);
  }
}
const token = () => randomBytes(24).toString("base64url");

async function opruimen(campaignId?: string) {
  // Ook eerdere proefresten: een script dat halverwege stukloopt laat een
  // campagne met een gevulde wachtrij achter, en die pakt de volgende ronde op.
  const oud = await db.select({ id: emailCampaigns.id }).from(emailCampaigns).where(sql`name like 'PROEF%'`);
  for (const o of oud) {
    await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, o.id));
    await db.delete(emailCampaigns).where(eq(emailCampaigns.id, o.id));
  }
  if (campaignId) {
    await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId));
    await db.delete(emailCampaigns).where(eq(emailCampaigns.id, campaignId));
  }
  await db.delete(prospects).where(inArray(prospects.email, TEST_ADRESSEN));
}

async function main() {
  if (!process.argv.includes("--ja")) {
    console.log("Dit script verstuurt echte mail naar onze eigen adressen. Draai met --ja als je dat wil.");
    process.exit(1);
  }
  console.log("verzendkanaal gereed:", bulkGereed());
  await opruimen();

  // Testprospects. Let op: adressen die al contact zijn worden door de wachtrij
  // overgeslagen — daarom checken we dat eerst.
  const alContact = (await db.execute(sql`
    select lower(email) e from contacts where lower(email) in ${TEST_ADRESSEN}`)) as unknown as { e: string }[];
  console.log("van de testadressen staat al in contacten:", alContact.map((x) => x.e).join(", ") || "geen");

  await db.insert(prospects).values(
    TEST_ADRESSEN.map((email) => ({
      companyName: `PROEF ${email}`,
      category: "hovenier" as const, // categorie zonder echte prospects met e-mail
      email,
      source: "manual" as const,
      status: "new" as const,
      unsubscribeToken: token(),
    })),
  ).onConflictDoNothing();

  const [c] = await db.insert(emailCampaigns).values({
    name: "PROEF verzendspoor",
    subject: "Proef: nieuwe collectie badkamers",
    introText: "Dit is een proefverzending vanuit het CRM. Niets aan de hand.",
    language: "nl",
    groups: [],
    audience: { categories: ["hovenier"] }, // alleen de testprospects vallen hierin
    throttleSeconds: 1,
    sendFromHour: 0,
    sendToHour: 24,
    weekdaysOnly: false,
  }).returning();
  console.log("campagne:", c.id);

  // Noodstop uit, opwarmstart leeg, cap standaard.
  await db.insert(bulkMailSettings).values({ id: "default", paused: false }).onConflictDoUpdate({
    target: bulkMailSettings.id, set: { paused: false, pausedReason: null, warmupStartedAt: null, dailyCapOverride: null },
  });

  console.log("ontvangers volgens de teller:", await telOntvangers(c));
  console.log("in de wachtrij gezet:", await vulWachtrij(c));
  const inRij = await db.select({ email: campaignRecipients.email }).from(campaignRecipients).where(eq(campaignRecipients.campaignId, c.id));
  eisAlleenEigenAdressen(inRij);
  console.log("controle: alleen eigen adressen in de wachtrij ✓");
  await db.update(emailCampaigns).set({ status: "queued" }).where(eq(emailCampaigns.id, c.id));
  console.log("nog te gaan:", await nogTeGaan(c.id));

  // Het transport blokkeert nu alles buiten habitat-one.com; controleer dat.
  console.log("domeinslot:", process.env.CAMPAIGN_ALLOWED_DOMAINS || "(geen — pas op!)");
  const r1 = await runCampaignSend();
  console.log("ronde 1:", JSON.stringify(r1));
  console.log("stand:", JSON.stringify(await wachtrijStand(c.id)));

  const rijen = await db.select({
    email: campaignRecipients.email, status: campaignRecipients.status,
    messageId: campaignRecipients.messageId, fout: campaignRecipients.lastError,
  }).from(campaignRecipients).where(eq(campaignRecipients.campaignId, c.id));
  for (const x of rijen) console.log(`  ${x.email} | ${x.status} | ${x.messageId ?? "-"} | ${x.fout ?? ""}`);

  // Tweede ronde: moet niets meer doen (wachtrij leeg) en de campagne afronden.
  const r2 = await runCampaignSend();
  console.log("ronde 2:", JSON.stringify(r2));
  const [na] = await db.select({ status: emailCampaigns.status, sentCount: emailCampaigns.sentCount }).from(emailCampaigns).where(eq(emailCampaigns.id, c.id));
  console.log("campagnestatus na:", JSON.stringify(na));

  // Frequentiecap: opnieuw vullen mag niets opleveren (net gemaild).
  const [cVers] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, c.id));
  console.log("nog eens vullen levert op:", await vulWachtrij(cVers), "(0 = frequentiecap werkt)");

  await opruimen(c.id);
  console.log("opgeruimd");
  process.exit(0);
}
main().catch(async (e) => { console.error("MISLUKT:", e); process.exit(1); });
