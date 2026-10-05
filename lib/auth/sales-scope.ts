import { and, isNull, or, sql, type SQL } from "drizzle-orm";
import { activities, appointments, emailInbox } from "@/lib/db/schema";

export function salesTaskFilter(role: string | undefined): SQL | undefined {
  if (role !== "sales") return undefined;
  return and(isNull(activities.dealId), isNull(activities.documentId), isNull(activities.propertyId));
}

/** Contact data stays visible; its mixed project/financial history does not. */
export function salesContactActivityFilter(role: string | undefined): SQL | undefined {
  if (role !== "sales") return undefined;
  return and(salesTaskFilter(role), sql`${activities.subject} in ('Verkoopnotitie', 'Opvolging', 'Beursopvolging', 'Verkooppuntdossier bijgewerkt', 'Opvolging afgehandeld', 'Opvolging heropend')`);
}

/** A sales user cannot widen their agenda by changing owner=all or a UUID. */
export function salesTaskAccess(role: string | undefined, userId: string): SQL | undefined {
  return role === "sales" ? and(salesTaskFilter(role), sql`coalesce(${activities.assigneeId}, ${activities.authorId}) = ${userId}::uuid`) : undefined;
}

export function salesAppointmentAccess(role: string | undefined, userId: string): SQL | undefined {
  return role === "sales" ? sql`coalesce(${appointments.assigneeId}, ${appointments.createdBy}) = ${userId}::uuid` : undefined;
}

/** Own mailbox, plus customer replies addressed to this seller in their own sales thread. */
export function salesMailFilter(role: string | undefined, email?: string | null): SQL | undefined {
  if (role !== "sales") return undefined;
  const seller = email?.trim().toLowerCase();
  if (!seller) return sql`false`;
  const office = process.env.GMAIL_USER?.trim().toLowerCase();
  const ownThread = office ? sql`
    lower(trim(${emailInbox.mailboxUser})) = ${office}
    and ${seller} = any(regexp_split_to_array(lower(coalesce(${emailInbox.toEmail}, '') || ',' || coalesce(${emailInbox.ccEmail}, '')), '\\s*,\\s*'))
    and exists (
      select 1 from partner_messages pm
      join users u on u.id = pm.author_id
      join contacts c on c.id = pm.contact_id
      where lower(trim(u.email)) = ${seller}
        and pm.status = 'sent' and pm.personal
        and pm.source in ('crm', 'crm:flexible-stone-custom-v1', 'crm:professional-display-v1', 'crm:reseller-display-v1', 'external-copy')
        and lower(trim(c.email)) = lower(trim(${emailInbox.fromEmail}))
        and pm.message_id is not null and pm.message_id <> ''
        and pm.message_id = any(regexp_split_to_array(trim(coalesce(${emailInbox.referencesHeader}, '')), '\\s+'))
    )` : undefined;
  return and(or(sql`lower(trim(${emailInbox.mailboxUser})) = ${seller}`, ownThread), isNull(emailInbox.linkedPurchaseOrderId));
}
