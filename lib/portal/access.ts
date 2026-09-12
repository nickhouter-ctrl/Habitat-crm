import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
export type PortalScope = "website" | "windows";
export async function hasPortalAccess(account:{id:string;websiteAccess:boolean},scope:PortalScope) {
 if(scope==="website") return account.websiteAccess;
 const rows=await db.execute<{allowed:boolean}>(sql`select exists(select 1 from windows.dealers where portal_account_id=${account.id} and status='active' and access_approved_at is not null) as allowed`);
 return rows[0]?.allowed===true;
}
