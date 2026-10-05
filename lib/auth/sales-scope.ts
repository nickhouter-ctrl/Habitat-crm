import { and, isNull, sql, type SQL } from "drizzle-orm";
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

/** Shared hi/purchase mail can contain project updates. Only own mailbox here. */
export function salesMailFilter(role: string | undefined, email?: string | null): SQL | undefined {
  if (role !== "sales") return undefined;
  return and(sql`lower(trim(${emailInbox.mailboxUser})) = ${email?.trim().toLowerCase() ?? ""}`, isNull(emailInbox.linkedPurchaseOrderId));
}
