import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailZichtbaarVoorSql } from "@/lib/mail-visibility";
import type { AgentRequest } from "./contract";

export class AgentConflict extends Error {}
export async function executeAgentRequest(input: AgentRequest, actorId: string, database: Pick<typeof db, "execute" | "transaction"> = db) {
  const mailScope = mailZichtbaarVoorSql(process.env.HERMES_AGENT_OWNER_EMAIL) ?? sql`true`;
  if (input.action === "search") {
    const q = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    const id = input.id ?? null;
    const n = input.limit;
    switch (input.resource) {
      case "contacts": return database.execute(sql`select id,name,email,phone,stage,owner_id from contacts where (${id}::uuid is null or id=${id}::uuid) and (name ilike ${q} or email ilike ${q}) order by updated_at desc limit ${n}`);
      case "projects": return database.execute(sql`select id,name,code,status,kind,contact_id from projects where (${id}::uuid is null or id=${id}::uuid) and (name ilike ${q} or code ilike ${q}) order by updated_at desc limit ${n}`);
      case "staff": return database.execute(sql`select id,name,email,role from users where (${id}::uuid is null or id=${id}::uuid) and (name ilike ${q} or email ilike ${q}) limit ${n}`);
      case "tasks": return database.execute(sql`select id,subject,left(body,4000) as body,due_at,completed_at,contact_id,assignee_id,author_id from activities where type='task' and (${id}::uuid is null or id=${id}::uuid) and coalesce(subject,'') ilike ${q} order by due_at desc nulls last limit ${n}`);
      case "emails": return database.execute(sql`select e.id,e.from_email,e.from_name,e.subject,e.received_at,left(e.body_text,8000) as body,s.draft,s.draft_subject from email_inbox e left join inbox_suggestions s on s.email_id=e.id where ${mailScope} and (${id}::uuid is null or e.id=${id}::uuid) and (coalesce(e.subject,'') ilike ${q} or e.from_email ilike ${q}) order by e.received_at desc limit ${n}`);
      case "invoice_reviews": return database.execute(sql`select id,status,proposed_supplier,proposed_reference,proposed_total,proposed_invoice_date,suggested_project_id,verdict,findings,duplicate_of_po_id,purchase_order_id from purchase_invoice_reviews where exists (select 1 from email_inbox e where e.id=purchase_invoice_reviews.email_id and ${mailScope}) and (${id}::uuid is null or id=${id}::uuid) and (coalesce(proposed_supplier,'') ilike ${q} or coalesce(proposed_reference,'') ilike ${q}) order by updated_at desc limit ${n}`);
      case "windows_projects": return database.execute(sql`select id,name,customer->>'name' as customer_name,left(notes,4000) as notes,archived,updated_at from windows.projects where (${id}::uuid is null or id=${id}::uuid) and name ilike ${q} order by updated_at desc limit ${n}`);
      case "windows_orders": return database.execute(sql`select o.id,o.number,o.status,o.project_id,p.name as project_name,o.planned_delivery,o.delivered_at,o.updated_at from windows.orders o join windows.projects p on p.id=o.project_id where (${id}::uuid is null or o.id=${id}::uuid) and (o.number ilike ${q} or p.name ilike ${q}) order by o.updated_at desc limit ${n}`);
    }
  }
  return database.transaction(async tx => {
    const key = `hermes:${actorId}:${input.requestId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const previous = await tx.execute(sql`select value from kv_cache where key=${key}`);
    if (previous.length) {
      const saved = previous[0].value as { fingerprint: string; result: unknown };
      if (saved.fingerprint !== fingerprint) throw new AgentConflict("request-id-reused");
      return saved.result;
    }
    let result: unknown;
    if (input.action === "create_followup" || input.action === "contact_note") {
      const contact = await tx.execute(sql`select id from contacts where id=${input.contactId}`);
      if (!contact.length) throw new AgentConflict("contact-not-found");
      const assignee = input.action === "create_followup" ? input.assigneeId ?? actorId : actorId;
      if (!(await tx.execute(sql`select id from users where id=${assignee}`)).length) throw new AgentConflict("assignee-not-found");
      result = await tx.execute(sql`insert into activities(type,subject,body,contact_id,author_id,assignee_id,due_at) values (${input.action === "create_followup" ? "task" : "note"}::activity_type,${input.action === "create_followup" ? input.subject : "Hermes: interne notitie"},${input.body},${input.contactId},${actorId},${assignee},${input.action === "create_followup" ? input.dueAt : null}) returning id`);
    } else if (input.action === "email_draft") {
      if (!(await tx.execute(sql`select e.id from email_inbox e where e.id=${input.emailId} and ${mailScope} for update`)).length) throw new AgentConflict("email-not-found");
      const old = await tx.execute(sql`select draft from inbox_suggestions where email_id=${input.emailId} for update`);
      if ((old[0]?.draft ?? null) !== input.expectedDraft) throw new AgentConflict("draft-changed-read-again");
      result = await tx.execute(sql`insert into inbox_suggestions(email_id,summary,reason,draft,draft_subject,needs_reply,source) values (${input.emailId},'Concept via Hermes','Op verzoek van de eigenaar',${input.body},${input.subject},true,'hermes') on conflict(email_id) do update set draft=excluded.draft,draft_subject=excluded.draft_subject,needs_reply=true,status='open',reviewed_by=null,reviewed_at=null,updated_at=now() returning id`);
    } else if (input.action === "invoice_project") {
      if (!(await tx.execute(sql`select id from projects where id=${input.projectId} and status='active'`)).length) throw new AgentConflict("active-project-not-found");
      result = await tx.execute(sql`update purchase_invoice_reviews set suggested_project_id=${input.projectId},updated_at=now() where id=${input.reviewId} and exists (select 1 from email_inbox e where e.id=purchase_invoice_reviews.email_id and ${mailScope}) and status='pending' and suggested_project_id is not distinct from ${input.expectedProjectId}::uuid returning id,status,suggested_project_id`);
      if (!(result as unknown[]).length) throw new AgentConflict("review-changed-or-not-pending");
    } else {
      if (!(await tx.execute(sql`select id from windows.orders where id=${input.orderId}`)).length) throw new AgentConflict("order-not-found");
      result = await tx.execute(sql`insert into windows.order_events(order_id,actor_role,actor_name,type,message,visible_to_dealer) values (${input.orderId},'admin','Hermes namens Habitat','note',${input.body},false) returning id`);
    }
    await tx.execute(sql`insert into activities(type,subject,body,author_id) values ('note',${`Hermes: ${input.action}`},${JSON.stringify({ requestId: input.requestId, result })},${actorId})`);
    await tx.execute(sql`insert into kv_cache(key,value) values (${key},${JSON.stringify({fingerprint,result})}::jsonb)`);
    return result;
  });
}
