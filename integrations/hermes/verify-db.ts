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
 const projectId=randomUUID(), attachmentId=randomUUID(), reviewId=randomUUID();
 await tx.execute(sql`insert into projects(id,name) values (${projectId},'Hermes transaction verification')`);
 await tx.execute(sql`insert into mail_attachments(id,email_id,filename,storage_path) values (${attachmentId},${emailId},'test.pdf','verification-only')`);
 await tx.execute(sql`insert into purchase_invoice_reviews(id,email_id,mail_attachment_id) values (${reviewId},${emailId},${attachmentId})`);
 const matching={action:'invoice_project' as const,requestId:randomUUID(),reviewId,projectId,expectedProjectId:null};
 await executeAgentRequest(matching,owner,tx);
 await assert.rejects(()=>executeAgentRequest({...matching,requestId:randomUUID()},owner,tx),AgentConflict);
 const review=await tx.execute(sql`select status,purchase_order_id,suggested_project_id from purchase_invoice_reviews where id=${reviewId}`);
 assert.equal(review[0].status,'pending');assert.equal(review[0].purchase_order_id,null);assert.equal(review[0].suggested_project_id,projectId);
 const windowProjectId=randomUUID(),quoteId=randomUUID(),orderId=randomUUID();
 await tx.execute(sql`insert into windows.projects(id,name,customer) values (${windowProjectId},'Hermes transaction verification','{}')`);
 await tx.execute(sql`insert into windows.quotes(id,project_id,number,snapshot,share_token) values (${quoteId},${windowProjectId},${randomUUID()},'{}',${randomUUID()})`);
 await tx.execute(sql`insert into windows.orders(id,project_id,quote_id,number,snapshot) values (${orderId},${windowProjectId},${quoteId},${randomUUID()},'{}')`);
 await executeAgentRequest({action:'windows_note',requestId:randomUUID(),orderId,body:'Internal verification'},owner,tx);
 const note=await tx.execute(sql`select visible_to_dealer from windows.order_events where order_id=${orderId}`);
 assert.equal(note.length,1);assert.equal(note[0].visible_to_dealer,false);
 console.log('PASS all five write operations, replay protection, optimistic conflicts, invoice remains pending, Windows note remains internal');
 throw rollback;
 }); }catch(error){if(error!==rollback)throw error;console.log('ROLLBACK verified; no test records committed');}finally{await pgClient.end()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'failed');process.exitCode=1});
