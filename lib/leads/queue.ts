/**
 * De wachtrij vullen: wie krijgt deze campagne?
 *
 * Eén `insert … select`, en dat is een bewuste keuze. De oude
 * `resolveRecipients` laadde de hele suppressielijst én alle prospects in het
 * geheugen om ze daarna in JavaScript te filteren. Bij 7.000 prospects is dat
 * traag, en bij groei loopt het vast. Hier gebeurt het filteren in de database:
 * constant geheugen, één round-trip, en de frequentiecap zit er meteen in.
 *
 * Wie valt er af, en waarom:
 *   • geen e-mailadres                     — niet mailbaar
 *   • status ≠ new/emailed                 — heeft geantwoord, is klant geworden,
 *                                            afgemeld, gebounced of overgeslagen
 *   • staat op de afmeldlijst              — over campagnes heen, voor altijd
 *   • staat in de contactenlijst           — bestaande klanten krijgen geen koude mail
 *   • al {maxEmailsPerProspect}× gemaild   — frequentiecap
 *   • binnen {minDaysSinceLastEmail} dagen — frequentiecap
 *   • suppressUntil in de toekomst         — tijdelijk niet mailen (zachte bounce)
 */
// Bewust géén "server-only": de controlescripts (npx tsx) draaien de wachtrij-SQL
// ook, en juist dat wil je tegen de echte database kunnen aflopen. Het blijft
// serverwerk — dit bestand hangt aan @/lib/db respectievelijk aan een
// API-sleutel, dus in een clientbundel loopt het meteen stuk.
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { campaignRecipients, emailCampaigns } from "@/lib/db/schema";
import { signEmailToken } from "@/lib/leads/unsub-token";

type Campagne = typeof emailCampaigns.$inferSelect;

/**
 * De voorwaarde die bepaalt of een prospect deze campagne mag krijgen.
 * Categorieën gaan als gebonden array mee, niet als samengestelde SQL.
 */
function prospectFilter(c: Campagne) {
  const explicit = c.audience?.explicitEmails;
  const explicitClause = explicit ? (explicit.length ? sql`and lower(p.email) in ${explicit}` : sql`and false`) : sql``;
  const cats = (c.audience?.categories ?? []) as string[];
  // Geen categorieën gekozen = alle categorieën. De clausule wordt dan helemaal
  // niet meegebouwd: `in ()` is geen geldige SQL, en een lege lijst als "alles"
  // moet nergens per ongeluk "niets" gaan betekenen.
  const catClausule = cats.length ? sql`and p.category::text in ${cats}` : sql``;
  return sql`
    p.email is not null
    and p.status in ('new', 'emailed')
    ${catClausule}
    ${explicitClause}
    and (p.suppress_until is null or p.suppress_until < now())
    and coalesce(p.email_count, 0) < ${c.maxEmailsPerProspect}
    and (p.last_emailed_at is null or p.last_emailed_at < now() - make_interval(days => ${c.minDaysSinceLastEmail}))
    and not exists (select 1 from email_suppressions s where lower(s.email) = lower(p.email))
    and not exists (select 1 from contacts ct where lower(ct.email) = lower(p.email))
  `;
}

/** Hoeveel ontvangers zou deze campagne krijgen? Zelfde voorwaarde, alleen tellen. */
export async function telOntvangers(c: Campagne): Promise<number> {
  const rijen = (await db.execute(sql`
    select count(*)::int as n from prospects p where ${prospectFilter(c)}
  `)) as unknown as { n: number }[];
  return Number(rijen[0]?.n ?? 0);
}

/**
 * Zet alle ontvangers als `queued` in de wachtrij. Dit is óók de bescherming
 * tegen dubbel verzenden: op (campaign_id, email) ligt een unieke index, dus
 * twee keer vullen levert geen tweede mail op.
 */
export async function vulWachtrij(c: Campagne): Promise<number> {
  const rijen = (await db.execute(sql`
    insert into campaign_recipients
      (campaign_id, prospect_id, email, status, queued_at, next_attempt_at, lang, company_name_snapshot, unsub_token)
    select ${c.id}::uuid, p.id, lower(p.email), 'queued'::campaign_send_status, now(),
           coalesce(${c.scheduledAt ?? null}::timestamptz, now()),
           ${c.language}, p.company_name, p.unsubscribe_token
    from prospects p
    where ${prospectFilter(c)}
    on conflict (campaign_id, email) do nothing
    returning id
  `)) as unknown as { id: string }[];
  return rijen.length;
}

/**
 * Bestaande klanten meenemen (zachte opt-in, met afmeldlink). Hun afmeldtoken
 * is een HMAC over het adres — die hebben ze niet in de database staan.
 */
export async function vulWachtrijKlanten(c: Campagne): Promise<number> {
  if (c.audience?.explicitEmails || !c.audience?.includeCustomers) return 0;
  const klanten = (await db.execute(sql`
    select ct.email, ct.name from contacts ct
    where ct.email is not null and ct.type = 'customer'
      and not exists (select 1 from email_suppressions s where lower(s.email) = lower(ct.email))
      and not exists (select 1 from campaign_recipients r where r.campaign_id = ${c.id} and r.email = lower(ct.email))
  `)) as unknown as { email: string; name: string }[];
  if (!klanten.length) return 0;

  const gezet = await db
    .insert(campaignRecipients)
    .values(
      klanten.map((k) => ({
        campaignId: c.id,
        prospectId: null,
        email: k.email.toLowerCase(),
        status: "queued" as const,
        nextAttemptAt: c.scheduledAt ?? new Date(),
        lang: c.language,
        companyNameSnapshot: k.name,
        unsubToken: signEmailToken(k.email),
      })),
    )
    .onConflictDoNothing({ target: [campaignRecipients.campaignId, campaignRecipients.email] })
    .returning({ id: campaignRecipients.id });
  return gezet.length;
}

/** Tellers per status, voor de voortgang op het scherm. */
export async function wachtrijStand(campaignId: string): Promise<Record<string, number>> {
  const rijen = await db
    .select({ status: campaignRecipients.status, n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId))
    .groupBy(campaignRecipients.status);
  return Object.fromEntries(rijen.map((r) => [r.status, Number(r.n)]));
}

/** Nog te versturen in deze campagne. */
export async function nogTeGaan(campaignId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, "queued")));
  return Number(r?.n ?? 0);
}
