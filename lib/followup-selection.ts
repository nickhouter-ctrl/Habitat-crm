import { and, or, sql } from 'drizzle-orm';
import { contacts, partnerProfiles } from './db/schema';
import { COMPANY_INBOX } from './mail-bcc';

export const FOLLOWUP_EXCLUDED='opvolging:uitgesloten';
export const followupIncluded=sql`not (coalesce(${contacts.tags},'{}'::text[]) @> array[${FOLLOWUP_EXCLUDED}])`;
/**
 * Eigen collega's zijn geen opvolgklant. Sommigen staan ook als contact in het
 * CRM (Hans onder Creadores, een testdealer), en hun antwoord op een
 * teambericht kwam dan op de lijst als "Antwoord nodig". Intern = ons eigen
 * domein, of een adres waarmee iemand in het CRM inlogt.
 */
const EIGEN_DOMEIN = COMPANY_INBOX.split('@')[1].toLowerCase();
export const followupNotInternal=sql`not (
  lower(trim(coalesce(${contacts.email},''))) like ${'%@' + EIGEN_DOMEIN}
  or exists (select 1 from users u where lower(trim(u.email)) = lower(trim(${contacts.email})))
)`;
/** A contact type or reseller label alone is not a reason to contact someone. */
export const followupEligible=and(followupIncluded,followupNotInternal,sql`coalesce(${partnerProfiles.stage},'new') <> 'stopped'`,or(
  sql`${contacts.source} ~* '^(beurs(:|$)|website:feria)' or exists (select 1 from unnest(coalesce(${contacts.tags},'{}'::text[])) tag where tag ~* '^(beurs(:|$)|website:feria)')`,
  sql`exists (select 1 from quote_requests q where q.contact_id=${contacts.id} and q.status <> 'rejected')`,
  sql`nullif(trim(${partnerProfiles.nextAction}),'') is not null`,
  sql`exists (select 1 from activities a where a.contact_id=${contacts.id} and a.type='task' and a.completed_at is null)`,
  sql`exists (select 1 from partner_messages m where m.contact_id=${contacts.id} and m.personal and m.status='sent')`,
));
