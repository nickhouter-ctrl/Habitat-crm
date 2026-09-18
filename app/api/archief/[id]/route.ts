/**
 * Download een mail-bijlage. Vereist auth. Genereert signed URL + redirect.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { huidigeToegangOfNull } from "@/lib/auth/access";
import { weigerRoute } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments } from "@/lib/db/schema";
import { signAttachmentUrl } from "@/lib/email-attachments";
import { isMarketingGebruiker, marketingMailbox } from "@/lib/mail-visibility";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const nee = await weigerRoute("inbox");
  if (nee) return nee;

  const { id } = await params;
  const att = await db.query.mailAttachments.findFirst({ where: eq(mailAttachments.id, id) });
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Een bijlage uit een persoonlijk postvak is ook persoonlijk. Zonder deze
  // controle zou de bijlage met alleen het id nog op te halen zijn.
  const marketing = marketingMailbox();
  if (marketing && att.emailId) {
    const ik = await huidigeToegangOfNull();
    if (!isMarketingGebruiker(ik?.email)) {
      const mail = await db.query.emailInbox.findFirst({
        where: eq(emailInbox.id, att.emailId),
        columns: { mailboxUser: true },
      });
      if (mail?.mailboxUser === marketing) return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  const url = await signAttachmentUrl(att.storagePath);
  return NextResponse.redirect(url);
}
