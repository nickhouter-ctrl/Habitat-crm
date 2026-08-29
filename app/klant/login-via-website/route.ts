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
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { kiesTaal, zetKlantSessie } from "@/lib/klant-portal";
import { verifyPortalToken } from "@/lib/portal/token";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const taal = kiesTaal(url.searchParams.get("lang"));
  const payload = verifyPortalToken(url.searchParams.get("token"));
  if (!payload) {
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
