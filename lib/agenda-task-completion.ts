import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, contacts, partnerProfiles } from "@/lib/db/schema";
import { agendaDay } from "@/lib/agenda-dates";
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from "@/lib/followup-checklist";

const isFollowup=(task:typeof activities.$inferSelect)=>!!task.contactId&&['Opvolging','Beursopvolging'].includes(task.subject??'');

/** Contact first, then task: same lock order as saving the follow-up dossier. */
export async function changeAgendaTask(id:string,authorId:string,completed:boolean){
  await db.transaction(async tx=>{
    const [initial]=await tx.select().from(activities).where(and(eq(activities.id,id),eq(activities.type,'task')));
    if(!initial)return;
    if(initial.contactId)await tx.select({id:contacts.id}).from(contacts).where(eq(contacts.id,initial.contactId)).for('update');
    const [task]=await tx.select().from(activities).where(and(eq(activities.id,id),eq(activities.type,'task'))).for('update');
    if(!task||!!task.completedAt===completed)return; // Idempotent checkbox / network retry.
    const now=new Date();
    if(isFollowup(task)){
      const contactId=task.contactId!;
      const [profile]=await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId,contactId)).for('update');
      if(completed){
        // Clear precisely this scheduled action, including when completed early.
        // A later action or incoming reply must still be able to reopen the dossier.
        if(profile&&profile.nextAction===task.body&&profile.nextActionOn===(task.dueAt?agendaDay(task.dueAt):null)){
          await tx.update(partnerProfiles).set({nextAction:null,nextActionOn:null,version:sql`${partnerProfiles.version}+1`,updatedAt:now}).where(eq(partnerProfiles.contactId,contactId));
        }
        const [other]=await tx.select({id:activities.id}).from(activities).where(and(eq(activities.contactId,contactId),eq(activities.type,'task'),inArray(activities.subject,['Opvolging','Beursopvolging']),isNull(activities.completedAt),sql`${activities.id} <> ${id}::uuid`)).limit(1);
        // Never mark another still-open follow-up action as done.
        if(!other)await tx.insert(activities).values({contactId,type:'note',subject:FOLLOWUP_DONE,body:'Opvolgtaak vanuit de agenda afgerond.',authorId,createdAt:now,updatedAt:now});
      }else{
        const [latest]=await tx.select().from(activities).where(and(eq(activities.contactId,contactId),eq(activities.type,'note'),inArray(activities.subject,[FOLLOWUP_DONE,FOLLOWUP_REOPENED]))).orderBy(desc(activities.createdAt),desc(activities.id)).limit(1);
        // Do not overwrite a new plan created while the old task was completed.
        if(profile&&!profile.nextAction&&profile.stage!=='stopped')await tx.update(partnerProfiles).set({nextAction:task.body,nextActionOn:task.dueAt?agendaDay(task.dueAt):null,ownerId:task.assigneeId,version:sql`${partnerProfiles.version}+1`,updatedAt:now}).where(eq(partnerProfiles.contactId,contactId));
        if(latest?.subject!==FOLLOWUP_REOPENED)await tx.insert(activities).values({contactId,type:'note',subject:FOLLOWUP_REOPENED,body:'Opvolgtaak vanuit de agenda heropend.',authorId,createdAt:now,updatedAt:now});
      }
    }
    await tx.update(activities).set({completedAt:completed?now:null,updatedAt:now}).where(eq(activities.id,id));
  });
}
