/**
 * Doorgeefkoppeling vanaf habitat-one.com: de website stuurt de klant met zijn
 * webshop-sessietoken (lib/portal/token.ts, gedeelde PORTAL_JWT_SECRET) naar
 * deze route; wij verifiëren en zetten de portaal-sessiecookie — één login
 * voor webshop én projectportaal.
 *
 * De projecten hangen aan het CONTACT: staat er een contactId in het token,
 * dan gebruiken we het e-mailadres van dat contact (accountmail en
 * contactmail kunnen nét verschillen).
 */
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { contacts, customerAccounts } from "@/lib/db/schema";
import { kiesTaal, zetKlantSessie } from "@/lib/klant-portal";
import { verifyPortalToken } from "@/lib/portal/token";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const taal = kiesTaal(url.searchParams.get("lang"));
  // ?code=<eenmalig>.<kort token van 60 s> — uitgegeven door /api/portal/handoff.
  const code = url.searchParams.get("code") ?? "";
  const punt = code.indexOf(".");
  const nonce = punt > 0 ? code.slice(0, punt) : "";
  const payload = punt > 0 ? verifyPortalToken(code.slice(punt + 1)) : null;
  const account = payload ? await db.query.customerAccounts.findFirst({where:eq(customerAccounts.id,payload.sub)}) : null;
  let eenmalig = false;
  if (payload && nonce) {
    // De vlag uit rate_limits halen: bestaat hij niet (meer), dan is de code al gebruikt of verzonnen.
    const r = (await db.execute(sql`delete from rate_limits where "key" = ${`handoff:${nonce}`} and window_start > now() - interval '2 minutes' returning "key"`)) as unknown as unknown[];
    eenmalig = r.length === 1;
  }
  if (!payload || !eenmalig || payload.scope === "windows" || !account?.websiteAccess || account.status !== "active") {
    return NextResponse.redirect(new URL(`/klant?lang=${taal}&invalid=1`, url.origin));
  }

  let email = payload.email?.toLowerCase().trim() ?? "";
  if (payload.contactId) {
    const [c] = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, payload.contactId))
      .limit(1);
    if (c?.email) email = c.email.toLowerCase().trim();
  }
  if (!email) {
    return NextResponse.redirect(new URL(`/klant?lang=${taal}&invalid=1`, url.origin));
  }

  await zetKlantSessie(email);
  return NextResponse.redirect(new URL(`/klant/projecten?lang=${taal}`, url.origin));
}
