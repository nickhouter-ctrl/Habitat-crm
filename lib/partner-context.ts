import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, partnerProfiles, partnerMessages, quoteRequests, emailInbox } from "@/lib/db/schema";
import { isMarketingGebruiker, marketingMailbox, mailZichtbaarVoor } from "@/lib/mail-visibility";
import { PARTNER_DIRECTION } from "@/lib/partners";
export function partnerMailVisible(email?: string | null) {
  const m=marketingMailbox();
  return m && !isMarketingGebruiker(email)?sql`${partnerMessages.mailboxUser} <> ${m}`:undefined;
}
export async function partnerContext(email: string | null | undefined, viewerEmail?: string | null) {
  if(!email) return PARTNER_DIRECTION;
  const found=await db.select({contact:contacts,profile:partnerProfiles}).from(contacts)
    .leftJoin(partnerProfiles,eq(partnerProfiles.contactId,contacts.id))
    .where(sql`lower(trim(${contacts.email})) = ${email.trim().toLowerCase()}`).limit(2);
  if(found.length!==1) return PARTNER_DIRECTION;
  const {contact,profile}=found[0];
  const [requests,sent,received]=await Promise.all([
    db.select({company:quoteRequests.company,message:quoteRequests.message,source:quoteRequests.source}).from(quoteRequests).where(eq(quoteRequests.contactId,contact.id)).orderBy(desc(quoteRequests.createdAt)).limit(5),
    db.select({subject:partnerMessages.subject,body:partnerMessages.body,sentAt:partnerMessages.sentAt}).from(partnerMessages)
    .where(and(eq(partnerMessages.contactId,contact.id),eq(partnerMessages.status,'sent'),partnerMailVisible(viewerEmail)))
    .orderBy(desc(partnerMessages.sentAt)).limit(3),
    db.select({subject:emailInbox.subject,body:emailInbox.bodyText,receivedAt:emailInbox.receivedAt}).from(emailInbox)
      .where(and(sql`lower(trim(${emailInbox.fromEmail})) = ${email.trim().toLowerCase()}`,mailZichtbaarVoor(viewerEmail)))
      .orderBy(desc(emailInbox.receivedAt)).limit(3),
  ]);
  return `${PARTNER_DIRECTION}\nCRM-brongegevens: ${JSON.stringify({naam:contact.name,beroep:contact.type,herkomst:contact.source,tags:contact.tags,interesse:profile?.interest??(contact.tags?.includes('rol:wederverkoper')?'interested':'unknown'),fase:profile?.stage,notities:profile?.notes?.slice(0,4000),contactnotities:contact.notes?.slice(0,3000),aanvragen:requests.map(r=>({...r,message:r.message?.slice(0,2000)})),volgendeActie:profile?.nextAction,verzonden:sent.map(m=>({...m,body:m.body.slice(0,3000)})),ontvangen:received.map(m=>({...m,body:m.body?.slice(0,3000)}))})}`;
}
