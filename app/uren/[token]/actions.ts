"use server";
import { and,eq,isNotNull,isNull,sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { portalLinkForToken } from "@/lib/worker-portal";
export type LogHoursState={ok?:string;error?:string}|null;
/** Old browser tabs must refresh instead of bypassing mandatory weekly review. */
export async function logHours(token:string,_prev:LogHoursState,_formData:FormData):Promise<LogHoursState> {
 const ctx=await portalLinkForToken(token);
 if(!ctx)return {error:"Link niet geldig / Enlace no válido"};
 return {error:"Vernieuw de pagina en gebruik de weekstaat. / Actualiza la página y usa el parte semanal."};
}
export async function deleteOwnEntry(token:string,entryId:string):Promise<void> {
 const ctx=await portalLinkForToken(token);if(!ctx || !/^[0-9a-f-]{36}$/.test(entryId))return;
 await db.delete(timeEntries).where(and(eq(timeEntries.id,entryId),eq(timeEntries.workerId,ctx.worker.id),eq(timeEntries.projectId,ctx.project.id),isNotNull(timeEntries.selfLoggedAt),isNull(timeEntries.weekSheetId),isNull(timeEntries.approvedAt),isNull(timeEntries.purchaseOrderId),isNull(timeEntries.paidAt),sql`${timeEntries.createdAt} > now() - interval '7 days'`));
 revalidatePath(`/uren/${token}`);revalidatePath(`/projects/${ctx.project.id}`);
}
