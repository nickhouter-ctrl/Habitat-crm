import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, partnerProfiles, partnerMessages, quoteRequests } from "@/lib/db/schema";
import { isMarketingGebruiker, marketingMailbox } from "@/lib/mail-visibility";
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
  const requests=await db.select({company:quoteRequests.company,message:quoteRequests.message,source:quoteRequests.source}).from(quoteRequests).where(eq(quoteRequests.contactId,contact.id)).limit(5);
  const sent=await db.select({subject:partnerMessages.subject,body:partnerMessages.body,sentAt:partnerMessages.sentAt}).from(partnerMessages)
    .where(and(eq(partnerMessages.contactId,contact.id),eq(partnerMessages.status,'sent'),partnerMailVisible(viewerEmail)))
    .orderBy(desc(partnerMessages.sentAt)).limit(3);
  return `${PARTNER_DIRECTION}\nCRM-brongegevens: ${JSON.stringify({naam:contact.name,beroep:contact.type,interesse:profile?.interest??(contact.tags?.includes('rol:wederverkoper')?'interested':'unknown'),fase:profile?.stage,notities:profile?.notes,contactnotities:contact.notes?.slice(0,3000),beursgesprekken:requests.map(r=>({...r,message:r.message?.slice(0,2000)})),volgendeActie:profile?.nextAction,verzonden:sent.map(m=>({...m,body:m.body.slice(0,3000)}))})}`;
}
