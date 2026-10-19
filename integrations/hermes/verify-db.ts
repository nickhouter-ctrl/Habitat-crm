import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { executeAgentRequest, AgentConflict } from '../../lib/hermes/service';
import { db, pgClient } from '../../lib/db';
const owner='366e92e0-0740-401b-96fb-50cf1f67d690';
const rollback=new Error('expected rollback');
async function main(){
 try { await db.transaction(async tx=>{
 const contactId=randomUUID(), emailId=randomUUID();
 await tx.execute(sql`insert into contacts(id,name) values (${contactId},'Hermes transaction verification')`);
 await tx.execute(sql`insert into email_inbox(id,message_id,subject) values (${emailId},${randomUUID()},'Hermes transaction verification')`);
 const task={action:'create_followup' as const,requestId:randomUUID(),contactId,subject:'Transaction test',body:'Will be rolled back',dueAt:'2026-10-20T12:00:00+02:00'};
 const first=await executeAgentRequest(task,owner,tx);
 const second=await executeAgentRequest(task,owner,tx);
 assert.equal(JSON.stringify(first),JSON.stringify(second));
 await assert.rejects(()=>executeAgentRequest({...task,subject:'Different request'},owner,tx),AgentConflict);
 const draft={action:'email_draft' as const,requestId:randomUUID(),emailId,subject:'Draft',body:'Draft text',expectedDraft:null};
 await executeAgentRequest(draft,owner,tx);
 await assert.rejects(()=>executeAgentRequest({...draft,requestId:randomUUID(),body:'Overwrite'},owner,tx),AgentConflict);
 await executeAgentRequest({...draft,requestId:randomUUID(),body:'Updated',expectedDraft:'Draft text'},owner,tx);
 await executeAgentRequest({action:'contact_note',requestId:randomUUID(),contactId,body:'Internal'},owner,tx);
 await assert.rejects(()=>executeAgentRequest({action:'windows_note',requestId:randomUUID(),orderId:randomUUID(),body:'Test'},owner,tx),AgentConflict);
 console.log('PASS followup, replay deduplication, request-id collision, draft concurrency, contact note, missing order');
 throw rollback;
 }); }catch(error){if(error!==rollback)throw error;console.log('ROLLBACK verified; no test records committed');}finally{await pgClient.end()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'failed');process.exitCode=1});
