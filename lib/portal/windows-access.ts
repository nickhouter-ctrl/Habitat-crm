import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Alleen vanuit een gecontroleerde CRM-beheeractie aanroepen. */
export async function grantWindowsAccess(account: { id: string; email: string; businessName: string | null; vatNumber?: string | null }) {
  if (!account.businessName?.trim() || !account.vatNumber?.trim()) throw new Error("Bedrijfsnaam en btw-nummer zijn verplicht voor Windows-toegang. Vul deze eerst aan bij Online toegang.");
  await db.execute(sql`
    insert into windows.dealers (portal_account_id, email, company_name, vat_number, status, access_approved_at)
    values (${account.id}, ${account.email}, ${account.businessName}, ${account.vatNumber}, 'active', now())
    on conflict (portal_account_id) do update
    set company_name = excluded.company_name, vat_number = excluded.vat_number, access_approved_at = now(), status = 'active', updated_at = now()
  `);
}
