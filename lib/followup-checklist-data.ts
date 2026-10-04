import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { followupEligible } from './followup-selection';
import { activities } from '@/lib/db/schema';
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from '@/lib/followup-checklist';
import { isMarketingGebruiker, mailZichtbaarVoorSql, marketingMailbox } from '@/lib/mail-visibility';

export const followupCompletionFilter = and(eq(activities.type, 'note'), inArray(activities.subject, [FOLLOWUP_DONE, FOLLOWUP_REOPENED]));
export async function latestFollowupCompletions(contactIds: string[]) {
  if (!contactIds.length) return [];
  return db.selectDistinctOn([activities.contactId], {
    contactId: activities.contactId, id: activities.id, subject: activities.subject, createdAt: activities.createdAt,
  }).from(activities).where(and(inArray(activities.contactId, contactIds), followupCompletionFilter))
    .orderBy(activities.contactId, desc(activities.createdAt), desc(activities.id));
}

/**
 * Hoeveel klanten wachten op een antwoord van ons — precies wat de tegel
 * "Antwoord nodig" op /opvolging toont, maar als één teller voor de zijbalk.
 *
 * In ruwe SQL en niet door de pagina-logica heen, omdat deze teller bij ELKE
 * paginaweergave meeloopt. Drie keer één doorloop (inkomend, uitgaand, vinkjes)
 * en daarna hash-joins — geen subquery per contact, want dan zou een menuteller
 * de hele mailbox per contact doorzoeken.
 *
 * De voorwaarden volgen `conversationState` en `followupCompleted`: nieuwste
 * binnenkomende mail nieuwer dan onze laatste persoonlijke mail, nog niet
 * afgevinkt (of na het vinkje opnieuw gereageerd, of de opvolgdatum is
 * inmiddels verstreken), en het contact staat op de opvolglijst.
 */
export async function telAntwoordNodig(userEmail?: string | null): Promise<number> {
  const zichtbaar = mailZichtbaarVoorSql(userEmail, 'e');
  // Dezelfde regel voor de UITGAANDE kant: ziet de teller een mail van Teresa
  // die de lijst verbergt, dan staat er "wachten op klant" tegenover een
  // cijfer dat iets anders beweert.
  const prive = marketingMailbox();
  const uitZichtbaar = prive && !isMarketingGebruiker(userEmail) ? sql`and mailbox_user <> ${prive}` : sql``;
  const rijen = await db.execute<{ n: number }>(sql`
    with laatste_in as (
      select distinct on (c.id) c.id as contact_id, e.received_at
      from email_inbox e
      join contacts c on c.email is not null and lower(trim(c.email)) = lower(trim(e.from_email))
      where e.received_at is not null ${zichtbaar ? sql`and ${zichtbaar}` : sql``}
      order by c.id, e.received_at desc
    ), laatste_uit as (
      select contact_id, max(sent_at) as sent_at from partner_messages
      where status = 'sent' and personal and sent_at is not null ${uitZichtbaar} group by contact_id
    ), laatste_vink as (
      select distinct on (contact_id) contact_id, subject, created_at from activities
      where type = 'note' and subject in (${FOLLOWUP_DONE}, ${FOLLOWUP_REOPENED})
      order by contact_id, created_at desc, id desc
    )
    select count(*)::int as n
    from laatste_in i
    join contacts on contacts.id = i.contact_id
    left join partner_profiles on partner_profiles.contact_id = contacts.id
    left join laatste_uit u on u.contact_id = contacts.id
    left join laatste_vink v on v.contact_id = contacts.id
    where (u.sent_at is null or i.received_at > u.sent_at)
      and (v.subject is distinct from ${FOLLOWUP_DONE}
        or i.received_at > v.created_at
        or (partner_profiles.next_action_on is not null
          and partner_profiles.next_action_on > (v.created_at at time zone 'Europe/Madrid')::date
          and partner_profiles.next_action_on <= (now() at time zone 'Europe/Madrid')::date))
      and ${followupEligible}
  `);
  return rijen[0]?.n ?? 0;
}
