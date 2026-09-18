/**
 * Wie ziet welk postvak.
 *
 * hi@ en purchase@ zijn gedeelde postvakken: daar hoort het hele team bij. Het
 * marketingpostvak (teresa@) is dat niet — dat is haar eigen klantcontact, en
 * de rest van het team hoeft dat niet te zien. Echte aanvragen komen immers
 * gewoon in hi@ binnen.
 *
 * De regel staat hier, op één plek, omdat hij op vier plaatsen moet gelden: de
 * inbox, de teller in het menu, de dagtaken en de assistent. Eén ervan vergeten
 * betekent dat haar mail alsnog in iemands lijstje opduikt.
 */
import { sql, type SQL } from "drizzle-orm";

import { emailInbox, inboxSuggestions } from "@/lib/db/schema";

/** Het marketingpostvak, of null als dat niet is ingesteld. */
export function marketingMailbox(): string | null {
  const u = process.env.GMAIL_MARKETING_USER?.trim().toLowerCase();
  return u || null;
}

/** Hoort dit e-mailadres bij het marketingpostvak? */
export function isMarketingGebruiker(email: string | null | undefined): boolean {
  const m = marketingMailbox();
  return !!m && !!email && email.trim().toLowerCase() === m;
}

/**
 * Filter op de mail die deze gebruiker mag zien. `undefined` = geen beperking.
 *
 * `is distinct from` in plaats van `<>`, want rijen van vóór de kolom
 * `mailbox_user` hebben NULL en moeten zichtbaar blijven — met `<>` zou NULL
 * nooit waar zijn en zou de hele oude inbox verdwijnen.
 */
export function mailZichtbaarVoor(email: string | null | undefined): SQL | undefined {
  const m = marketingMailbox();
  if (!m) return undefined;
  if (isMarketingGebruiker(email)) return undefined; // zij ziet alles
  return sql`${emailInbox.mailboxUser} is distinct from ${m}`;
}

/**
 * Dezelfde regel voor de assistent-voorstellen: die hangen aan een mail, dus de
 * zichtbaarheid van het voorstel volgt die van de mail.
 */
export function voorstelZichtbaarVoor(email: string | null | undefined): SQL | undefined {
  const m = marketingMailbox();
  if (!m || isMarketingGebruiker(email)) return undefined;
  return sql`not exists (
    select 1 from email_inbox e
    where e.id = ${inboxSuggestions.emailId} and e.mailbox_user = ${m}
  )`;
}

/** Zelfde regel, maar voor een query die `email_inbox` als `e` aliast in ruwe SQL. */
export function mailZichtbaarVoorSql(email: string | null | undefined, alias = "e"): SQL | undefined {
  const m = marketingMailbox();
  if (!m || isMarketingGebruiker(email)) return undefined;
  return sql`${sql.raw(`${alias}.mailbox_user`)} is distinct from ${m}`;
}
