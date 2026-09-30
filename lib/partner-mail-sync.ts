import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { isPersonalPartnerMail } from "@/lib/partner-mail-kind";
import { simpleParser } from "mailparser";
import { db } from "@/lib/db";
import { contacts, emailInbox, inboxSuggestions, emailSyncState, partnerMessages, partnerProfiles, quoteRequests } from "@/lib/db/schema";
import { createImapClient, type MailAccount } from "@/lib/gmail";

/** Alleen beurscontacten; IMAP-lezen verandert geen gelezen/archiefstatus. */
export async function syncPartnerSent(account: MailAccount, rescan = false) {
  const mailbox = account.user.trim().toLowerCase();
  const candidates = await db.select({ id: contacts.id, email: contacts.email }).from(contacts)
    .where(or(inArray(contacts.id,db.select({id:partnerProfiles.contactId}).from(partnerProfiles)),inArray(contacts.id, db.select({ id: quoteRequests.contactId }).from(quoteRequests).where(sql`${quoteRequests.source} like 'beurs:%'`))));
  const matches = new Map<string, string[]>();
  for (const c of candidates) if(c.email) {
    const key=c.email.trim().toLowerCase(); matches.set(key,[...(matches.get(key)??[]),c.id]);
  }
  const cursorId=`partner-sent:${mailbox}`;
  const [state]=await db.select().from(emailSyncState).where(eq(emailSyncState.id,cursorId));
  const client=createImapClient(account);
  await client.connect();
  let imported=0;
  try {
    const folders=await client.list();
    const folder=folders.find(f=>f.specialUse==='\\Sent');
    if(!folder) throw new Error("Verzonden-map niet gevonden.");
    const lock=await client.getMailboxLock(folder.path);
    try {
      const since=new Date(Date.now()-45*86400000);
      // UIDVALIDITY voorkomt overslaan na opnieuw aanmaken van de map.
      const validity=String(client.mailbox && client.mailbox.uidValidity);
      const cursor=!rescan && state?.errorMessage===validity ? state.lastImapUid : 0;
      const found=await client.search({ since, ...(cursor? {uid:`${cursor+1}:*`}: {}) },{uid:true});
      const ids=(found||[]).filter(id=>id>cursor).sort((a,b)=>a-b).slice(0,100);
      let maxUid=cursor;
      const known=new Set((await db.select({id:partnerMessages.messageId}).from(partnerMessages).where(eq(partnerMessages.mailboxUser,mailbox))).map(m=>m.id));
      const relevant:number[]=[];
      if(ids.length) for await(const msg of client.fetch(ids.join(','),{envelope:true,uid:true},{uid:true})) {
        if(!known.has(msg.envelope?.messageId??null) && msg.envelope?.to?.some(r=>matches.has((r.address??'').toLowerCase()))) relevant.push(msg.uid);
      }
      if(relevant.length) for await (const msg of client.fetch(relevant.join(','),{source:true,uid:true},{uid:true})) {
        if(!msg.source) throw new Error("Mailinhoud ontbreekt; synchronisatie niet afgerond.");
        const parsed=await simpleParser(msg.source);
        const recipients=Array.isArray(parsed.to)?parsed.to.flatMap(v=>v.value):parsed.to?.value??[];
        const contactIds=new Set(recipients.flatMap(r=> {const found=matches.get((r.address??'').toLowerCase()); return found?.length===1?found:[];}));
        if(contactIds.size===1 && parsed.messageId) {
          const contactId=[...contactIds][0];
          const inserted=await db.insert(partnerMessages).values({ contactId,status:'sent',source:'mailbox',
            personal:isPersonalPartnerMail(parsed.subject??'',parsed.inReplyTo), mailboxUser:mailbox,toEmail:recipients.map(r=>r.address).filter(Boolean).join(', '),
            subject:parsed.subject??'(geen onderwerp)',body:parsed.text??'',html:typeof parsed.html==='string'?parsed.html:null,
            messageId:parsed.messageId,referencesHeader:Array.isArray(parsed.references)?parsed.references.join(' '):parsed.references??null,
            sentAt:parsed.date??new Date(),attachments:(parsed.attachments??[]).map(a=>({name:a.filename??'bijlage',size:a.size})),
          }).onConflictDoNothing().returning({id:partnerMessages.id});
          imported+=inserted.length;
          const refs=[parsed.inReplyTo,...(Array.isArray(parsed.references)?parsed.references:parsed.references?.split(/\s+/)??[])].filter((r):r is string=>!!r);
          if(refs.length && isPersonalPartnerMail(parsed.subject??'',parsed.inReplyTo)) await db.update(inboxSuggestions).set({status:'reviewed',needsReply:false,draft:null,draftSubject:null,reviewedAt:parsed.date??new Date(),updatedAt:new Date()}).where(and(eq(inboxSuggestions.status,'open'),inArray(inboxSuggestions.emailId,db.select({id:emailInbox.id}).from(emailInbox).where(and(inArray(emailInbox.messageId,refs),eq(emailInbox.mailboxUser,mailbox))))));
        }
        maxUid=Math.max(maxUid,msg.uid);
      }
      maxUid=Math.max(maxUid,...ids);
      await db.insert(emailSyncState).values({id:cursorId,lastImapUid:maxUid,lastPolledAt:new Date(),errorMessage:validity})
        .onConflictDoUpdate({target:emailSyncState.id,set:{lastImapUid:maxUid,lastPolledAt:new Date(),errorMessage:validity,updatedAt:new Date()}});
      return { imported, more:(found||[]).filter(id=>id>cursor).length>ids.length };
    } finally { lock.release(); }
  } finally { await client.logout().catch(()=>{}); }
}
