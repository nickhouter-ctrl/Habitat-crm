/**
 * Eén verzendronde. Wordt aangeroepen door de cron (elke tien minuten) en door
 * de knop "nu een ronde draaien" op de campagnepagina.
 *
 * De opzet in één zin: de **wachtrij is de staat**. Een time-out, een deploy
 * halverwege of een crash laat hoogstens de rijen van deze ronde op `sending`
 * staan, en die worden na een kwartier door het onderhoud teruggezet. Er is dus
 * niets om te "hervatten" — de volgende ronde pakt gewoon op wat er nog staat.
 *
 * Drie lagen tegen dubbel verzenden, want dat is de fout die je niet kunt
 * terugnemen:
 *   1. de unieke index op (campaign_id, email) — twee keer in de wachtrij kan niet;
 *   2. `for update skip locked` bij het oppakken — twee gelijktijdige rondes
 *      (de cron en iemand die op de knop drukt) pakken nooit dezelfde rij;
 *   3. het `message_id` wordt vóór de status weggeschreven, zodat een rij die
 *      mogelijk al verstuurd is nooit opnieuw de wachtrij in gaat.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  bulkMailSettings,
  campaignRecipients,
  emailCampaigns,
  prospects,
} from "@/lib/db/schema";
import { buildCampaignEmail, unsubscribeUrl, type CampaignLang } from "@/lib/leads/campaign";
import { groupHeroUrl, groupLabel, groupUrl, type CampaignGroup } from "@/lib/leads/groups";
import { bulkGereed, sendBulkMail } from "@/lib/leads/transport";
import { dagCap, inVenster, moetStoppen, opnieuwNa, pauzeMs, rondeBudget } from "@/lib/leads/warmup";
import { madridMiddernacht } from "@/lib/tz-madrid";

/** Mails per ronde. Bij 6 seconden pauze is dat ongeveer 2,5 minuut. */
const PER_RONDE = 25;
/** Harde stop binnen de ronde, ruim onder de maxDuration van 300s. */
const DEADLINE_MS = 240_000;
/** Een rij die zo lang op `sending` staat, is ergens blijven hangen. */
const VASTGELOPEN_MIN = 15;

export interface RondeResultaat {
  ok: boolean;
  verstuurd: number;
  mislukt: number;
  /** Waarom er (nog) niets gebeurde — voor de melding op het scherm. */
  reden?: string;
  campagne?: string;
  cap?: number;
  vandaagVerstuurd?: number;
}

/** De instellingenrij; wordt bij de eerste aanroep aangemaakt. */
async function instellingen() {
  const [rij] = await db.select().from(bulkMailSettings).where(eq(bulkMailSettings.id, "default"));
  if (rij) return rij;
  const [nieuw] = await db.insert(bulkMailSettings).values({ id: "default" }).onConflictDoNothing().returning();
  return nieuw ?? (await db.select().from(bulkMailSettings).where(eq(bulkMailSettings.id, "default")))[0];
}

/**
 * Hoeveel is er vandaag de deur uit? Gemeten, niet bijgehouden in een teller:
 * een teller loopt uit de pas zodra er iets misgaat. En over álle campagnes
 * heen, want de cap is een grens van het domein, niet van een campagne.
 */
async function vandaagVerstuurd(nu: Date): Promise<number> {
  const middernacht = madridMiddernacht(nu);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    // gte() en niet een losse sql-vergelijking: postgres.js kan een Date wél
    // binden via de kolomtypes van drizzle, maar niet als ruwe parameter.
    .where(and(inArray(campaignRecipients.status, ["sent", "bounced", "complained"]), gte(campaignRecipients.sentAt, middernacht)));
  return Number(r?.n ?? 0);
}

/** Bounce- en klachtcijfers over de laatste verzendingen, voor de noodrem. */
async function recenteKwaliteit(): Promise<{ verstuurd: number; bounces: number; klachten: number }> {
  const rijen = (await db.execute(sql`
    select
      count(*)::int as verstuurd,
      count(*) filter (where status = 'bounced' and bounce_type <> 'soft')::int as bounces,
      count(*) filter (where status = 'complained')::int as klachten
    from (
      select status, bounce_type from campaign_recipients
      where sent_at is not null order by sent_at desc limit 500
    ) laatste
  `)) as unknown as { verstuurd: number; bounces: number; klachten: number }[];
  return rijen[0] ?? { verstuurd: 0, bounces: 0, klachten: 0 };
}

async function groepenVoorMail(collections: string[], lang: string): Promise<CampaignGroup[]> {
  const uit: CampaignGroup[] = [];
  for (const collection of collections) {
    const rep = (await db.execute(sql`
      select image_url from products
      where collection = ${collection} and is_active and image_url is not null limit 1
    `)) as unknown as { image_url: string | null }[];
    uit.push({
      collection,
      label: groupLabel(collection, lang),
      url: groupUrl(collection, lang),
      imageUrl: groupHeroUrl(collection) ?? rep[0]?.image_url ?? null,
    });
  }
  return uit;
}

/**
 * Pak een portie op. `for update skip locked` is hier het hele punt: twee
 * gelijktijdige rondes stappen om elkaar heen in plaats van op dezelfde rij te
 * wachten of hem beide te pakken.
 */
async function pakOp(campaignId: string, hoeveel: number) {
  return (await db.execute(sql`
    with opgepakt as (
      select id from campaign_recipients
      where campaign_id = ${campaignId} and status = 'queued' and next_attempt_at <= now()
      order by next_attempt_at, id
      limit ${hoeveel}
      for update skip locked
    )
    update campaign_recipients r
       set status = 'sending'::campaign_send_status, attempts = r.attempts + 1, locked_at = now()
      from opgepakt o
     where r.id = o.id
    returning r.id, r.email, r.prospect_id, r.company_name_snapshot, r.unsub_token, r.attempts, r.lang
  `)) as unknown as {
    id: string;
    email: string;
    prospect_id: string | null;
    company_name_snapshot: string | null;
    unsub_token: string | null;
    attempts: number;
    lang: string | null;
  }[];
}

/** Rijen die zijn blijven hangen terugzetten; aangeroepen aan het begin van elke ronde. */
export async function herstelVastgelopen(): Promise<number> {
  const rijen = (await db.execute(sql`
    update campaign_recipients
       set status = (case
             -- Een rij met een message_id is wél verstuurd; alleen de
             -- statusupdate is niet geland. Die mag nooit opnieuw de deur uit.
             when message_id is not null then 'sent'
             when attempts >= 3 then 'failed'
             else 'queued'
           end)::campaign_send_status,
           sent_at = case when message_id is not null then coalesce(sent_at, locked_at, now()) else sent_at end,
           locked_at = null,
           last_error = case when message_id is null and attempts >= 3 then 'na drie pogingen opgegeven' else last_error end
     where status = 'sending'
       and locked_at < now() - make_interval(mins => ${VASTGELOPEN_MIN})
    returning id
  `)) as unknown as { id: string }[];
  return rijen.length;
}

export async function runCampaignSend(): Promise<RondeResultaat> {
  const start = Date.now();
  const nu = new Date();

  if (!bulkGereed()) {
    return { ok: false, verstuurd: 0, mislukt: 0, reden: "Verzendkanaal niet ingesteld (RESEND_API_KEY ontbreekt)." };
  }

  await herstelVastgelopen();

  const inst = await instellingen();
  if (inst.paused) {
    return { ok: true, verstuurd: 0, mislukt: 0, reden: inst.pausedReason ?? "Verzenden staat stil (noodstop)." };
  }

  // Noodrem vóór het versturen: liever nu stoppen dan straks een geblokkeerd domein.
  const kwaliteit = await recenteKwaliteit();
  const stop = moetStoppen(kwaliteit);
  if (stop) {
    await db
      .update(bulkMailSettings)
      .set({ paused: true, pausedReason: `Automatisch gestopt: ${stop}.`, updatedAt: new Date() })
      .where(eq(bulkMailSettings.id, "default"));
    return { ok: false, verstuurd: 0, mislukt: 0, reden: `Automatisch gestopt: ${stop}.` };
  }

  const cap = dagCap(inst.warmupStartedAt, nu, inst.dailyCapOverride);
  const alUit = await vandaagVerstuurd(nu);
  const budget = rondeBudget({ cap, vandaagVerstuurd: alUit, perRonde: PER_RONDE });
  if (budget <= 0) {
    return { ok: true, verstuurd: 0, mislukt: 0, cap, vandaagVerstuurd: alUit, reden: `Dagcap bereikt (${alUit}/${cap}).` };
  }

  // Oudste wachtende campagne eerst, en alleen als die binnen zijn venster zit.
  const kandidaten = await db
    .select()
    .from(emailCampaigns)
    .where(
      and(
        inArray(emailCampaigns.status, ["queued", "sending"]),
        sql`(${emailCampaigns.scheduledAt} is null or ${emailCampaigns.scheduledAt} <= now())`,
      ),
    )
    .orderBy(emailCampaigns.createdAt);

  const campagne = kandidaten.find((c) =>
    inVenster(nu, { vanUur: c.sendFromHour, totUur: c.sendToHour, alleenWerkdagen: c.weekdaysOnly }),
  );
  if (!campagne) {
    const reden = kandidaten.length
      ? "Buiten het verzendvenster van de campagne."
      : "Geen campagne in de wachtrij.";
    return { ok: true, verstuurd: 0, mislukt: 0, cap, vandaagVerstuurd: alUit, reden };
  }

  const eigenCap = campagne.dailyCap != null ? Math.min(campagne.dailyCap, cap) : cap;
  const eigenBudget = rondeBudget({ cap: eigenCap, vandaagVerstuurd: alUit, perRonde: PER_RONDE });
  if (eigenBudget <= 0) {
    return { ok: true, verstuurd: 0, mislukt: 0, cap: eigenCap, vandaagVerstuurd: alUit, reden: "Dagcap van deze campagne bereikt." };
  }

  const rijen = await pakOp(campagne.id, eigenBudget);
  if (rijen.length === 0) {
    // Niets meer te doen: campagne afronden.
    await db
      .update(emailCampaigns)
      .set({ status: "sent", sentAt: campagne.sentAt ?? new Date(), updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campagne.id));
    return { ok: true, verstuurd: 0, mislukt: 0, campagne: campagne.name, reden: "Wachtrij van deze campagne is leeg." };
  }

  await db.update(emailCampaigns).set({ status: "sending", updatedAt: new Date() }).where(eq(emailCampaigns.id, campagne.id));
  const groepen = await groepenVoorMail(campagne.groups, campagne.language);

  let verstuurd = 0;
  let mislukt = 0;

  for (const [i, r] of rijen.entries()) {
    if (Date.now() - start > DEADLINE_MS) {
      // Tijd op: de rest blijft op `sending` staan en wordt door het onderhoud
      // teruggezet. Niets gaat verloren.
      break;
    }

    const token = r.unsub_token ?? "";
    const { html, text } = buildCampaignEmail({
      lang: (r.lang ?? campagne.language) as CampaignLang,
      subject: campagne.subject,
      introText: campagne.introText,
      groups: groepen,
      unsubToken: token,
      companyName: r.company_name_snapshot,
    });

    const res = await sendBulkMail({
      to: r.email,
      subject: campagne.subject,
      html,
      text,
      recipientId: r.id,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(token)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (res.ok) {
      // Eerst het message_id, dan de status: als het hierna stukgaat, ziet het
      // onderhoud aan het message_id dat deze mail al weg is.
      await db
        .update(campaignRecipients)
        .set({ messageId: res.providerId, sentAt: new Date(), status: "sent", lockedAt: null, lastError: null })
        .where(eq(campaignRecipients.id, r.id));
      if (r.prospect_id) {
        await db
          .update(prospects)
          .set({
            status: "emailed",
            lastEmailedAt: new Date(),
            emailCount: sql`coalesce(${prospects.emailCount}, 0) + 1`,
            updatedAt: new Date(),
          })
          .where(eq(prospects.id, r.prospect_id));
      }
      verstuurd++;
    } else if (res.opnieuw && r.attempts < 3) {
      await db
        .update(campaignRecipients)
        .set({
          status: "queued",
          nextAttemptAt: new Date(Date.now() + opnieuwNa(r.attempts)),
          lockedAt: null,
          lastError: res.fout,
        })
        .where(eq(campaignRecipients.id, r.id));
    } else {
      await db
        .update(campaignRecipients)
        .set({ status: "failed", lockedAt: null, lastError: res.fout })
        .where(eq(campaignRecipients.id, r.id));
      mislukt++;
    }

    // Druppelen, niet spuiten. De laatste van de ronde hoeft niet te wachten.
    if (i < rijen.length - 1) {
      await new Promise((r2) => setTimeout(r2, pauzeMs(campagne.throttleSeconds)));
    }
  }

  const [nog] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(and(eq(campaignRecipients.campaignId, campagne.id), inArray(campaignRecipients.status, ["queued", "sending"])));

  await db
    .update(emailCampaigns)
    .set({
      status: Number(nog?.n ?? 0) > 0 ? "sending" : "sent",
      sentCount: sql`${emailCampaigns.sentCount} + ${verstuurd}`,
      failedCount: sql`${emailCampaigns.failedCount} + ${mislukt}`,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campagne.id));

  // Eerste verzenddag vastleggen; hieraan hangt het opwarmschema.
  if (verstuurd > 0 && !inst.warmupStartedAt) {
    await db
      .update(bulkMailSettings)
      .set({ warmupStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(bulkMailSettings.id, "default"));
  }

  return { ok: true, verstuurd, mislukt, campagne: campagne.name, cap: eigenCap, vandaagVerstuurd: alUit + verstuurd };
}
