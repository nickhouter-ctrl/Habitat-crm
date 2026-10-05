/**
 * Melding dat een klant antwoordde op onze opvolgmail.
 *
 * Reacties komen binnen op hi@ en zijn in het CRM te lezen, maar niemand ziet
 * dat zonder de inbox te openen. Deze melding sluit dat gat: één mail per
 * poll-ronde met wie er antwoordde en waarop, met een link naar het dossier.
 *
 * Bewust één mail per ronde en niet één per reactie — een inhaalslag na een
 * showroommail aan 173 contacten mag geen 173 berichten opleveren.
 *
 * Wat als reactie telt: een binnengekomen mail van een adres dat bij een
 * contact hoort waaraan wij eerder persoonlijk hebben gemaild, en die ná die
 * mail is ontvangen. Dus niet elke willekeurige mail in hi@.
 */
import { and, desc, inArray, isNull, isNotNull, sql } from "drizzle-orm";

import { crmUrl } from "@/lib/crm-url";
import { db } from "@/lib/db";
import { contacts, emailInbox } from "@/lib/db/schema";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { NOTIFY_TO, NOTIFY_RECIPIENTS, systemMailAddresses } from "@/lib/mail-bcc";
import { followupIncluded, followupNotInternal } from "@/lib/followup-selection";
import { geenInkoopmail, marketingMailbox } from "@/lib/mail-visibility";

const APP_URL = crmUrl();

type Reactie = {
  id: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  tekst: string | null;
  receivedAt: Date | null;
  mailboxUser: string | null;
  contactId: string;
  contactNaam: string;
  /** Wie de laatste opvolgmail verstuurde; die hoort het als eerste te weten. */
  afzender: string | null;
};

/** Eén regel per reactie: wie, waarop, en de eerste paar regels van het antwoord. */
function blok(r: Reactie): string {
  const wanneer = r.receivedAt
    ? r.receivedAt.toLocaleString("nl-NL", { timeZone: "Europe/Madrid", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : "";
  return `<div style="margin:0 0 18px;padding:12px 14px;border:1px solid #e7e1d9;border-radius:8px">
    <p style="margin:0;font-size:15px"><strong>${escapeHtml(r.contactNaam)}</strong>
      <span style="color:#8a7f72;font-size:13px">${escapeHtml(r.fromEmail ?? "")}${wanneer ? ` · ${escapeHtml(wanneer)}` : ""}</span></p>
    ${r.subject ? `<p style="margin:6px 0 0;font-size:14px">${escapeHtml(r.subject)}</p>` : ""}
    ${r.tekst ? `<p style="margin:6px 0 0;font-size:13px;color:#6f6459">${escapeHtml(r.tekst)}</p>` : ""}
    <p style="margin:10px 0 0;font-size:13px"><a href="${APP_URL}/opvolging/${r.contactId}">Dossier openen en antwoorden</a></p>
  </div>`;
}

function tekstregel(r: Reactie): string {
  return [
    `- ${r.contactNaam} <${r.fromEmail ?? ""}>${r.subject ? ` · ${r.subject}` : ""}`,
    r.tekst ? `  ${r.tekst}` : "",
    `  ${APP_URL}/opvolging/${r.contactId}`,
  ].filter(Boolean).join("\n");
}

/** De reacties die nog niet gemeld zijn, nieuwste eerst. */
async function nieuweReacties(): Promise<Reactie[]> {
  return db
    .select({
      id: emailInbox.id,
      fromEmail: emailInbox.fromEmail,
      fromName: emailInbox.fromName,
      subject: emailInbox.subject,
      tekst: sql<string | null>`left(regexp_replace(coalesce(${emailInbox.bodyText}, ''), '\\s+', ' ', 'g'), 300)`,
      receivedAt: emailInbox.receivedAt,
      mailboxUser: emailInbox.mailboxUser,
      contactId: contacts.id,
      contactNaam: sql<string>`coalesce(nullif(trim(${contacts.name}), ''), ${emailInbox.fromEmail}, 'onbekend')`,
      afzender: sql<string | null>`(
        select u.email from partner_messages pm
        left join users u on u.id = pm.author_id
        where pm.contact_id = ${contacts.id} and pm.status = 'sent' and pm.personal
          and pm.sent_at is not null and pm.sent_at < ${emailInbox.receivedAt}
        order by pm.sent_at desc limit 1
      )`,
    })
    .from(emailInbox)
    .innerJoin(contacts, sql`lower(trim(${contacts.email})) = lower(trim(${emailInbox.fromEmail}))`)
    .where(and(
      isNull(emailInbox.followupNotifiedAt),
      // Facturen in purchase@ zijn geen klantreactie, ook niet als het adres
      // bij een contact hoort dat wij eerder mailden.
      geenInkoopmail(),
      // Een collega die op een teambericht antwoordt is geen klantreactie.
      followupNotInternal,
      isNotNull(emailInbox.receivedAt),
      followupIncluded,
      sql`${emailInbox.status} <> 'archived'`,
      // Alleen een antwoord op iets dat wíj stuurden.
      sql`exists (
        select 1 from partner_messages pm
        where pm.contact_id = ${contacts.id} and pm.status = 'sent' and pm.personal
          and pm.sent_at is not null and pm.sent_at < ${emailInbox.receivedAt}
      )`,
    ))
    .orderBy(desc(emailInbox.receivedAt))
    .limit(200);
}

/**
 * Meldt de reacties uit deze ronde. `followup_notified_at` wordt gezet of de
 * mail nu aankwam of niet: liever een gemiste melding dan elke tien minuten
 * hetzelfde bericht. De reacties staan hoe dan ook op /opvolging.
 */
export async function notifyFollowupReplies(): Promise<{ sent: boolean; count: number }> {
  const rijen = await nieuweReacties();
  if (rijen.length === 0) return { sent: false, count: 0 };

  // Het marketingpostvak is privé (lib/mail-visibility.ts): wat daar binnenkomt
  // meldt alleen aan haarzelf, de rest aan het team.
  const prive = marketingMailbox();
  const groepen: { to: string; rijen: Reactie[]; alleen: boolean }[] = [];
  const teamRijen = prive ? rijen.filter((r) => r.mailboxUser !== prive) : rijen;
  const priveRijen = prive ? rijen.filter((r) => r.mailboxUser === prive) : [];
  if (teamRijen.length) groepen.push({ to: NOTIFY_TO, rijen: teamRijen, alleen: false });
  if (prive && priveRijen.length) groepen.push({ to: prive, rijen: priveRijen, alleen: true });

  const resultaten = await Promise.all(groepen.map(async (g) => {
    const aantal = g.rijen.length;
    // Degene die de opvolgmail verstuurde erbij, ook als die niet in de vaste
    // kring zit (Hans, Elles): hij wacht op dit antwoord.
    const afzenders = [...new Set(g.rijen.map((r) => r.afzender?.trim()).filter((a): a is string => !!a))]
      .filter((a) => a.toLowerCase() !== g.to.toLowerCase());
    return sendEmail({
      to: g.to,
      bcc: g.alleen ? undefined : systemMailAddresses([...NOTIFY_RECIPIENTS.slice(1), ...afzenders].join(", ")),
      subject: aantal === 1
        ? `Reactie van ${g.rijen[0].contactNaam} — opvolgen`
        : `${aantal} klanten reageerden op onze mail — opvolgen`,
      html: brandedEmail(`
        <p><strong>${aantal === 1 ? "Een klant" : `${aantal} klanten`}</strong> antwoordde${aantal === 1 ? "" : "n"} op onze opvolgmail.
          ${aantal === 1 ? "Deze staat" : "Die staan"} weer open bij <a href="${APP_URL}/opvolging?filter=reply">Nog opvolgen</a>.</p>
        ${g.rijen.map(blok).join("")}
        <p style="color:#8a7f72;font-size:13px">Antwoord bij voorkeur in het CRM, dan blijft het bij de klant in het dossier staan.</p>
      `),
      text: [
        `${aantal} reactie${aantal === 1 ? "" : "s"} op onze opvolgmail:`,
        "",
        ...g.rijen.map(tekstregel),
        "",
        `${APP_URL}/opvolging?filter=reply`,
      ].join("\n"),
      // Een privépostvak blijft privé: geen bedrijfskopie van haar klantmail.
      noCompanyBcc: g.alleen,
      interneMelding: true,
      systemMailScope: "team", // Eigen klantreacties blijven bij de betrokken afzender.
    });
  }));

  await db
    .update(emailInbox)
    .set({ followupNotifiedAt: new Date(), updatedAt: new Date() })
    .where(inArray(emailInbox.id, rijen.map((r) => r.id)));

  return { sent: resultaten.some((r) => r.sent), count: rijen.length };
}

/** Markeert alles als gemeld zonder te verzenden — voor een eerste ingebruikname. */
export async function markFollowupRepliesNotified(): Promise<number> {
  const r = await db
    .update(emailInbox)
    .set({ followupNotifiedAt: new Date(), updatedAt: new Date() })
    .where(isNull(emailInbox.followupNotifiedAt))
    .returning({ id: emailInbox.id });
  return r.length;
}
