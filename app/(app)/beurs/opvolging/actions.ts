"use server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activities, appointments, contacts, emailSuppressions, partnerProfiles, partnerMessages } from "@/lib/db/schema";
import { madridUtcOffsetMinutes } from "@/lib/tz-madrid";
import { profileInput } from "@/lib/partners";
import { partnerContext, partnerMailVisible } from "@/lib/partner-context";
import { genereerMailAntwoord } from "@/lib/ai-reply";
import { getMailAccounts } from "@/lib/gmail";
import { syncPartnerSent } from "@/lib/partner-mail-sync";
import { isMarketingGebruiker, marketingMailbox } from "@/lib/mail-visibility";
import { persoonlijkeMail, sendEmail } from "@/lib/email";
import { beursBijlagen } from "@/lib/beurs-bijlagen";
import { recordSentEmail } from "@/lib/sent-email";
export type Result={error?:string;success?:string};
class InputError extends Error {}
function failure(e:unknown):Result { return {error:e instanceof InputError?e.message:e instanceof z.ZodError?e.issues[0].message:"Opslaan mislukt. Controleer de gegevens en probeer opnieuw."}; }
function refresh(id?:string){revalidatePath('/opvolging');revalidatePath('/beurs/opvolging');revalidatePath('/wederverkopers');if(id){revalidatePath(`/opvolging/${id}`);revalidatePath(`/beurs/opvolging/${id}`);}}
async function contact(id:string){const [c]=await db.select().from(contacts).where(eq(contacts.id,z.string().uuid().parse(id)));if(!c)throw new InputError('Contact niet gevonden.');return c;}
export async function saveProfile(_:Result,fd:FormData):Promise<Result>{
  const user=await requireModule('aanvragen');
  try {const d=profileInput.parse(Object.fromEntries(fd));
    await db.transaction(async tx=>{
      const [c]=await tx.select().from(contacts).where(eq(contacts.id,d.contactId)).for('update');if(!c)throw new InputError('Contact niet gevonden.');
      const [old]=await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId,d.contactId)).for('update');
      if((old?.version??0)!==d.version)throw new InputError('Dit dossier is gewijzigd. Vernieuw de pagina.');
      const values={interest:d.interest,stage:old?.active && d.stage!=='stopped'?'active':d.stage,language:d.language,ownerId:d.ownerId||null,nextAction:d.nextAction||null,nextActionOn:d.nextActionOn||null,notes:d.notes,version:d.version+1,updatedAt:new Date(),...(d.stage==='stopped'?{active:false,published:false}:{})};
      await tx.insert(partnerProfiles).values({contactId:d.contactId,...values}).onConflictDoUpdate({target:partnerProfiles.contactId,set:values});
      const [task]=await tx.select().from(activities).where(and(eq(activities.contactId,d.contactId),eq(activities.type,'task'),inArray(activities.subject,['Opvolging','Beursopvolging']),isNull(activities.completedAt))).limit(1);
      if(d.nextAction && d.nextActionOn){
        const wall=new Date(`${d.nextActionOn}T17:00:00Z`);
        const values={body:d.nextAction,dueAt:new Date(wall.getTime()-madridUtcOffsetMinutes(wall)*60000),assigneeId:d.ownerId||user.id,updatedAt:new Date()};
        if(task)await tx.update(activities).set(values).where(eq(activities.id,task.id));
        else await tx.insert(activities).values({contactId:d.contactId,type:'task',subject:'Opvolging',authorId:user.id,...values});
      }else if(task)await tx.update(activities).set({completedAt:new Date(),updatedAt:new Date()}).where(eq(activities.id,task.id));
      await tx.insert(activities).values({contactId:d.contactId,type:'note',subject:'Verkooppuntdossier bijgewerkt',body:JSON.stringify({before:old,after:values}),authorId:user.id});
    });revalidatePath('/agenda');refresh(d.contactId);return{success:'Dossier opgeslagen. Beroep en oorspronkelijke gegevens blijven bewaard.'};
  }catch(e){return failure(e);}
}
export async function syncSent(_:Result,_fd:FormData):Promise<Result>{
  const user=await requireModule('inbox');
  void _; void _fd;
  try {let imported=0,more=false; for(const a of getMailAccounts().filter(a=>a.user.toLowerCase()!==marketingMailbox()||isMarketingGebruiker(user.email))){const r=await syncPartnerSent(a);imported+=r.imported;more ||= r.more;}
    refresh();return{success:`${imported} verzonden mails gekoppeld.${more?' Er zijn meer mails; klik opnieuw om verder op te halen.':''}`};
  }catch{return{error:'Verzonden mails konden niet volledig worden opgehaald. Reeds gekoppelde mails blijven bewaard.'};}
}
export async function saveDraft(_:Result,fd:FormData):Promise<Result>{
  const user=await requireModule('aanvragen');await requireModule('inbox');
  try {const d=z.object({contactId:z.string().uuid(),subject:z.string().trim().min(1).max(250),body:z.string().trim().min(3).max(20000)}).parse(Object.fromEntries(fd));
    const c=await contact(d.contactId);const to=z.string().email().parse(c.email);
    const mailbox=(isMarketingGebruiker(user.email)?marketingMailbox():process.env.GMAIL_USER?.trim().toLowerCase());if(!mailbox)throw new InputError('Geen afzender ingesteld.');
    await db.insert(partnerMessages).values({...d,toEmail:to,mailboxUser:mailbox,authorId:user.id});refresh(d.contactId);return{success:'Concept bewaard. Controleer het concept hieronder voordat je verstuurt.'};
  }catch(e){return failure(e);}
}
export async function generateDraft(id:string,instruction:string){
  const user=await requireModule('aanvragen');await requireModule('inbox');
  const c=await contact(id);const context=await partnerContext(c.email,user.email);
  const [p]=await db.select().from(partnerProfiles).where(eq(partnerProfiles.contactId,id));
  return genereerMailAntwoord({soort:'mail',klantNaam:c.name,klantEmail:c.email,bericht:'Persoonlijke opvolging van dit contact. Vraag naar de volgende stap en verwerk de vastgelegde interesse. Noem herkomst en eerdere gesprekken alleen wanneer deze in het dossier staan.',crmContext:context,medewerker:user.name??'Habitat One',instructie:`${z.string().max(2000).parse(instruction)}\n${p?.language==='en-es'||!p?'Schrijf in Engels én Spaans.':''}\nDe video’s en technische data sheets staan op https://www.habitat-one.com/beurs/films . Vermeld deze link.`,taal:p?.language==='en-es'?undefined:p?.language});
}
export async function sendDraft(_:Result,fd:FormData):Promise<Result>{
  const user=await requireModule('aanvragen');await requireModule('inbox');
  try{const id=z.string().uuid().parse(fd.get('id'));const seen=z.string().datetime().parse(fd.get('updatedAt'));if(fd.get('confirm')!=='on')throw new InputError('Controleer ontvanger en inhoud en bevestig verzending.');
    const [d]=await db.select().from(partnerMessages).where(and(eq(partnerMessages.id,id),partnerMailVisible(user.email)));
    if(!d||d.status!=='draft'||d.updatedAt.toISOString()!==seen)throw new InputError('Dit concept is al verwerkt. Bij onzekere verzending eerst de mailbox controleren.');
    const c=await contact(d.contactId);if(c.email?.toLowerCase()!==d.toEmail.toLowerCase())throw new InputError('Het e-mailadres is gewijzigd; maak een nieuw concept.');
    const [blocked]=await db.select({id:emailSuppressions.id}).from(emailSuppressions).where(sql`lower(${emailSuppressions.email})=${d.toEmail.toLowerCase()}`);
    if(blocked)throw new InputError('Dit adres staat op de niet-mailenlijst.');
    const [profile]=await db.select().from(partnerProfiles).where(eq(partnerProfiles.contactId,c.id));
    if(profile?.stage==='stopped')throw new InputError('Dit dossier is gestopt. Heropen het bewust voordat je een nieuwe benadering verstuurt.');
    const attachments=await beursBijlagen();const rendered=persoonlijkeMail(d.body);
    const [claimed]=await db.update(partnerMessages).set({status:'sending',html:rendered.html,body:rendered.text,attachments:attachments.map(a=>({name:a.filename,size:Buffer.byteLength(a.content)})),updatedAt:new Date()})
      .where(and(eq(partnerMessages.id,id),eq(partnerMessages.status,'draft'),eq(partnerMessages.updatedAt,new Date(seen)))).returning();
    if(!claimed)throw new InputError('Dit concept wordt al verstuurd.');
    try {
      const r=await sendEmail({to:d.toEmail,subject:d.subject,html:rendered.html,text:rendered.text,attachments,fromUser:{name:user.name},fromMailbox:d.mailboxUser===marketingMailbox()?'marketing':'main',noCompanyBcc:d.mailboxUser===marketingMailbox()});
      if(!r.sent)throw new Error('Mailprovider bevestigt geen verzending');
      await db.update(partnerMessages).set({status:'sent',messageId:r.messageId??null,sentAt:new Date(),updatedAt:new Date()}).where(eq(partnerMessages.id,id));
      await recordSentEmail({kind:'other',contactId:c.id,toEmail:d.toEmail,subject:d.subject,html:rendered.html,text:rendered.text});
      await db.update(contacts).set({lastContactedAt:new Date()}).where(eq(contacts.id,c.id));
      await db.update(partnerProfiles).set({stage:'contacted',version:sql`${partnerProfiles.version}+1`,updatedAt:new Date()}).where(and(eq(partnerProfiles.contactId,c.id),eq(partnerProfiles.stage,'new')));
      refresh(c.id);return{success:'Verstuurd en bewaard, inclusief technische data sheets.'};
    }catch{await db.update(partnerMessages).set({status:'unknown',updatedAt:new Date()}).where(and(eq(partnerMessages.id,id),eq(partnerMessages.status,'sending')));refresh(c.id);return{error:'Verzending niet volledig bevestigd. Controleer Verzonden en synchroniseer voordat je opnieuw mailt.'};}
  }catch(e){return failure(e);}
}
export async function addMeeting(_:Result,fd:FormData):Promise<Result>{
  const user=await requireModule('aanvragen');await requireModule('agenda');
  try {const d=z.object({contactId:z.string().uuid(),title:z.string().trim().min(3).max(200),startsAt:z.string().datetime({offset:true}),minutes:z.coerce.number().int().min(5).max(480),location:z.string().max(500),notes:z.string().max(4000),confirmed:z.literal('on')}).parse(Object.fromEntries(fd));await contact(d.contactId);
    await db.insert(appointments).values({contactId:d.contactId,title:d.title,startsAt:new Date(d.startsAt),endsAt:new Date(Date.parse(d.startsAt)+d.minutes*60000),location:d.location,notes:d.notes,createdBy:user.id,assigneeId:user.id});revalidatePath('/agenda');refresh(d.contactId);return{success:'Bevestigde afspraak staat in de agenda. Er is geen uitnodigingsmail verstuurd.'};
  }catch(e){return failure(e);}
}

export async function editDraft(_:Result,fd:FormData):Promise<Result>{
 const user=await requireModule('aanvragen');await requireModule('inbox');
 try{const d=z.object({id:z.string().uuid(),updatedAt:z.string().datetime(),subject:z.string().trim().min(1).max(250),body:z.string().trim().min(3).max(20000)}).parse(Object.fromEntries(fd));
 const [changed]=await db.update(partnerMessages).set({subject:d.subject,body:d.body,updatedAt:new Date()}).where(and(eq(partnerMessages.id,d.id),eq(partnerMessages.status,'draft'),eq(partnerMessages.updatedAt,new Date(d.updatedAt)),partnerMailVisible(user.email))).returning();
 if(!changed)throw new InputError('Concept is gewijzigd of al verstuurd. Vernieuw de pagina.');refresh(changed.contactId);return{success:'Concept bijgewerkt.'};
 }catch(e){return failure(e);}
}
