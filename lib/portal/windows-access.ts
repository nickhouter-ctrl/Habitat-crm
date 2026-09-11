import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Alleen vanuit een gecontroleerde CRM-beheeractie aanroepen. */
export async function grantWindowsAccess(account: { id: string; email: string; businessName: string | null }) {
  await db.execute(sql`
    insert into windows.dealers (portal_account_id, email, company_name, status, access_approved_at)
    values (${account.id}, ${account.email}, ${account.businessName}, 'active', now())
    on conflict (portal_account_id) do update
    set access_approved_at = now(), status = 'active', updated_at = now()
  `);
}
