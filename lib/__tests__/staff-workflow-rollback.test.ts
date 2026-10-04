/** Real SQL, mock SMTP, unconditional rollback. Opt-in only. */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({current:null as unknown,user:null as unknown,mail:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/auth/guards',()=>({requireModule:vi.fn(async()=>m.user),requireModuleRead:vi.fn(async()=>m.user)}));
vi.mock('@/lib/i18n/server',async()=>({tekst:async()=>(await import('@/lib/i18n')).maakT('nl')}));
vi.mock('@/lib/db',async()=>{const real=await vi.importActual<typeof import('@/lib/db')>('@/lib/db');return {...real,db:new Proxy(real.db,{get(target,key){const active=(m.current??target) as typeof real.db;const value=Reflect.get(active,key);return typeof value==='function'?value.bind(active):value;}})};});
// The SQL fixtures have unique, non-routable addresses; transport policy is tested separately.
vi.mock('@/lib/mail-bcc', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/mail-bcc')>(), isSystemMailRecipient: () => true }));
vi.mock('@/lib/email',async()=>({...await vi.importActual<typeof import('@/lib/email')>('@/lib/email'),sendEmail:m.mail}));
vi.mock('@/lib/sent-email',()=>({recordSentEmail:vi.fn()}));
import { activities, appointments, contacts, partnerMessages, partnerProfiles, staffMessages, staffNotifications, users } from '../db/schema';
import { createAppointment, createTask } from '../../app/(app)/agenda/actions';
import { sendTeamMessage,markTeamMessageRead } from '../../app/(app)/teamberichten/actions';
import { saveProfile,sendDraft } from '../../app/(app)/beurs/opvolging/actions';
import { changeAgendaTask } from '../agenda-task-completion';
import { deliverStaffNotifications,staffAgendaItems } from '../staff-notifications';
import { latestFollowupCompletions } from '../followup-checklist-data';
import { FOLLOWUP_DONE,FOLLOWUP_REOPENED,followupCompleted } from '../followup-checklist';
const enabled=process.env.STAFF_WORKFLOW_DB_TEST==='1';
afterAll(async()=>{if(enabled)(await vi.importActual<typeof import('@/lib/db')>('@/lib/db')).pgClient.end({timeout:1});});
it.skipIf(!enabled)('keeps assignment, tasks, private messages, SMTP claims and completion consistent in real SQL',async()=>{
 const real=await vi.importActual<typeof import('@/lib/db')>('@/lib/db'),owner=randomUUID(),colleague=randomUUID(),outsider=randomUUID(),contactId=randomUUID(),requestId=randomUUID();
 const rollback=new Error('ROLLBACK_STAFF_WORKFLOW'),fd=(values:Record<string,string>)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;};
 const oldEffects=process.env.CRM_EXTERNAL_EFFECTS;delete process.env.CRM_EXTERNAL_EFFECTS;
 m.user={id:owner,role:'admin',name:'Owner',email:`${owner}@example.invalid`};m.mail.mockResolvedValue({sent:true,messageId:'mock-smtp'});
 try{
  await real.db.transaction(async tx=>{
   m.current=tx;
   await tx.insert(users).values([{id:owner,name:'Rollback Owner',email:`${owner}@example.invalid`,role:'admin'},{id:colleague,name:'Rollback Employee',email:`${colleague}@example.invalid`,role:'agent',locale:'en'},{id:outsider,name:'Rollback Outsider',email:`${outsider}@example.invalid`,role:'agent'}]);
   await tx.insert(contacts).values({id:contactId,name:'Rollback Client',email:`${contactId}@example.invalid`,type:'lead'});
   const msg=fd({submissionId:requestId,recipientId:colleague,contactId,subject:'Afspraak bij klant',body:'Bel de klant en plan een afspraak op locatie.',makeTask:'on',dueDate:'2026-10-04',time:'17:00',priority:'hoog'});
   expect((await sendTeamMessage({},msg)).success).toBeTruthy();expect(m.mail).toHaveBeenCalledTimes(1);
   expect(m.mail.mock.calls[0][0]).toMatchObject({to:`${colleague}@example.invalid`,noCompanyBcc:true,interneMelding:true});expect(m.mail.mock.calls[0][0].subject).toContain('Message from');
   expect((await sendTeamMessage({},msg)).messageId).toBe(requestId);expect(m.mail).toHaveBeenCalledTimes(1);
   const [message]=await tx.select().from(staffMessages).where(eq(staffMessages.id,requestId));expect(message.taskId).toBeTruthy();expect(message.readAt).toBeNull();
   m.user={id:outsider};await markTeamMessageRead(requestId);expect((await tx.select().from(staffMessages).where(eq(staffMessages.id,requestId)))[0].readAt).toBeNull();
   m.user={id:colleague};await markTeamMessageRead(requestId);expect((await tx.select().from(staffMessages).where(eq(staffMessages.id,requestId)))[0].readAt).toBeTruthy();
   m.user={id:owner,role:'admin',name:'Owner',email:`${owner}@example.invalid`};
   const profile=(version:number,ownerId=colleague)=>fd({contactId,version:String(version),interest:'unknown',stage:'discussion',language:'nl',ownerId,nextAction:'Klant bellen',nextActionOn:'2100-01-02',notes:'Afspraak in Bloemendaal.'});
   expect((await saveProfile({},profile(0))).success).toBeTruthy();expect(m.mail).toHaveBeenCalledTimes(2);
   expect((await saveProfile({},profile(1))).success).toBeTruthy();expect(m.mail).toHaveBeenCalledTimes(2);
   expect((await saveProfile({},profile(0))).error).toBeTruthy();expect(m.mail).toHaveBeenCalledTimes(2);
   const [followup]=await tx.select().from(activities).where(and(eq(activities.contactId,contactId),eq(activities.type,'task'),eq(activities.subject,'Opvolging')));
   await changeAgendaTask(followup.id,owner,true);expect((await latestFollowupCompletions([contactId]))[0].subject).toBe(FOLLOWUP_DONE);expect((await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId,contactId)))[0].nextActionOn).toBeNull();
   await changeAgendaTask(followup.id,owner,true);expect((await tx.select().from(activities).where(and(eq(activities.contactId,contactId),eq(activities.subject,FOLLOWUP_DONE))))).toHaveLength(1);
   await changeAgendaTask(followup.id,owner,false);expect((await latestFollowupCompletions([contactId]))[0].subject).toBe(FOLLOWUP_REOPENED);expect((await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId,contactId)))[0].nextActionOn).toBe('2100-01-02');
   // A default Postgres timestamp has microseconds: the exact bug reported by the user.
   const [draft]=await tx.insert(partnerMessages).values({contactId,subject:'Afspraak in Nederland',body:'Beste klant, kunnen wij een afspraak in Bloemendaal plannen?',toEmail:`${contactId}@example.invalid`,mailboxUser:process.env.GMAIL_USER?.trim()??'main@example.invalid',source:'crm',authorId:owner}).returning();
   expect((await sendDraft({},fd({id:draft.id,updatedAt:draft.updatedAt.toISOString(),confirm:'on'}))).success).toContain('automatisch');
   expect(m.mail.mock.calls.at(-1)?.[0].attachments).toEqual([]);
   expect((await tx.select().from(partnerMessages).where(eq(partnerMessages.id,draft.id)))[0].status).toBe('sent');
   const [done]=await latestFollowupCompletions([contactId]);expect(done.subject).toBe(FOLLOWUP_DONE);expect(followupCompleted(done,null,'2100-01-02','2026-10-04')).toBe(true);expect((await tx.select().from(activities).where(eq(activities.id,followup.id)))[0].completedAt).toBeNull();
   const callCount=m.mail.mock.calls.length;expect((await sendDraft({},fd({id:draft.id,updatedAt:draft.updatedAt.toISOString(),confirm:'on'}))).error).toBeTruthy();expect(m.mail).toHaveBeenCalledTimes(callCount);
   // Concurrent delivery calls may claim a notice once only.
   const [notice]=await tx.insert(staffNotifications).values({eventKey:`rollback:${requestId}`,kind:'team_message',entityId:requestId,userId:colleague,actorId:owner}).returning();
   await Promise.all([deliverStaffNotifications([notice.id]),deliverStaffNotifications([notice.id])]);expect(m.mail).toHaveBeenCalledTimes(callCount+1);
   const [unknownNotice]=await tx.insert(staffNotifications).values({eventKey:`unknown:${requestId}`,kind:'team_message',entityId:requestId,userId:colleague,actorId:owner}).returning();
   m.mail.mockRejectedValueOnce(new Error('SMTP outcome unknown'));await deliverStaffNotifications([unknownNotice.id]);expect((await tx.select().from(staffNotifications).where(eq(staffNotifications.id,unknownNotice.id)))[0].status).toBe('unknown');const afterUnknown=m.mail.mock.calls.length;await deliverStaffNotifications([unknownNotice.id]);expect(m.mail).toHaveBeenCalledTimes(afterUnknown);
   const agenda=await staffAgendaItems(colleague,'2026-10-04');expect(agenda.some(a=>a.id===message.taskId)).toBe(true);expect(agenda.some(a=>a.id===followup.id)).toBe(false);
   const taskId=randomUUID(),apptId=randomUUID(),unassignedId=randomUUID();
   const taskForm=fd({submissionId:taskId,subject:'Controle afspraak',date:'2026-10-04',time:'16:00',contactId,assigneeId:colleague});
   const meetingForm=fd({submissionId:apptId,title:'Afspraak bij de klant',date:'2026-10-04',time:'16:00',contactId,assigneeId:colleague});
   await createTask(taskForm);await createTask(taskForm);await createAppointment(meetingForm);await createAppointment(meetingForm);
   expect(await tx.select().from(activities).where(eq(activities.id,taskId))).toHaveLength(1);
   expect(await tx.select().from(appointments).where(eq(appointments.id,apptId))).toHaveLength(1);
   expect(await tx.select().from(staffNotifications).where(inArray(staffNotifications.eventKey,[`task:${taskId}`,`appointment:${apptId}`]))).toHaveLength(2);
   const unassigned=fd({submissionId:unassignedId,title:'Algemene afspraak',date:'2026-10-04',time:'16:00',contactId});
   await createAppointment(unassigned);await createAppointment(unassigned);
   expect(await tx.select().from(appointments).where(eq(appointments.id,unassignedId))).toHaveLength(1);
   throw rollback;
  });
  throw new Error('Unexpected fixture commit');
 }catch(error){if(error!==rollback)throw error;}finally{m.current=null;if(oldEffects===undefined)delete process.env.CRM_EXTERNAL_EFFECTS;else process.env.CRM_EXTERNAL_EFFECTS=oldEffects;}
 expect(await real.db.select().from(users).where(inArray(users.id,[owner,colleague,outsider]))).toHaveLength(0);
},60000);
