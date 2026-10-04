import { and, or, sql } from 'drizzle-orm';
import { contacts, partnerProfiles } from './db/schema';

export const FOLLOWUP_EXCLUDED='opvolging:uitgesloten';
export const followupIncluded=sql`not (coalesce(${contacts.tags},'{}'::text[]) @> array[${FOLLOWUP_EXCLUDED}])`;
/** A contact type or reseller label alone is not a reason to contact someone. */
export const followupEligible=and(followupIncluded,sql`coalesce(${partnerProfiles.stage},'new') <> 'stopped'`,or(
  sql`${contacts.source} ~* '^(beurs(:|$)|website:feria)' or exists (select 1 from unnest(coalesce(${contacts.tags},'{}'::text[])) tag where tag ~* '^(beurs(:|$)|website:feria)')`,
  sql`exists (select 1 from quote_requests q where q.contact_id=${contacts.id} and q.status <> 'rejected')`,
  sql`nullif(trim(${partnerProfiles.nextAction}),'') is not null`,
  sql`exists (select 1 from activities a where a.contact_id=${contacts.id} and a.type='task' and a.completed_at is null)`,
  sql`exists (select 1 from partner_messages m where m.contact_id=${contacts.id} and m.personal and m.status='sent')`,
));
