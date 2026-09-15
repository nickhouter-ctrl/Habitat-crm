import "server-only";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const WINDOWS_AGENTS = {order:"Ordercontrole",finance:"Financiële controle",progress:"Voortgangsbewaker",factory:"Fabrieksassistent",communication:"Communicatieassistent",quality:"Softwarecontrole"} as const;
type Finding = {code:string;message:string;severity:"error"|"warning"|"info";source:string};
type Run = {id:string;agent:keyof typeof WINDOWS_AGENTS;order_id:string|null;state:string;summary:string|null;findings:Finding[];completed_at:string|null;order_number:string|null;customer:string|null;project:string|null;contact_id:string|null;dealer_name:string|null};
type Proposal = {id:string;order_id:string;kind:string;title:string;state:string;crm_activity_id:string|null;order_number:string;customer:string};

/** De bestaande gedeelde Windows-tabellen; geen tweede CRM-klantenadministratie. */
export async function getWindowsAgents() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ready = (await db.execute(sql`select 1 from information_schema.tables where table_schema='windows' and table_name='agent_settings'`)).length>0;
  if (!ready) return {ready,runs:[] as Run[],proposals:[] as Proposal[],settings:null,canAct:session.user.role!=="viewer"};
  const [runs,proposals,settings] = await Promise.all([
    db.execute<Run>(sql`select r.id,r.agent,r.order_id,r.state,r.summary,r.findings,r.completed_at::text,
      o.number as order_number,o.snapshot->'customer'->>'name' as customer,o.snapshot->>'projectName' as project,
      ca.contact_id,d.company_name as dealer_name
      from (select distinct on(agent,order_id) * from windows.agent_runs order by agent,order_id,created_at desc) r
      left join windows.orders o on o.id=r.order_id left join windows.dealers d on d.id=o.dealer_id
      left join public.customer_accounts ca on ca.id::text=d.portal_account_id order by r.created_at desc limit 300`),
    db.execute<Proposal>(sql`select p.id,p.order_id,p.kind,p.title,p.state,p.crm_activity_id,o.number as order_number,o.snapshot->'customer'->>'name' as customer
      from windows.agent_proposals p join windows.orders o on o.id=p.order_id
      where p.state in ('pending','sending','uncertain','done','sent') order by p.created_at desc limit 100`),
    db.execute<{enabled:boolean;ai_enabled:boolean;last_sweep_at:string|null}>(sql`select enabled,ai_enabled,last_sweep_at::text from windows.agent_settings where id='global'`),
  ]);
  return {ready,runs:[...runs],proposals:[...proposals],settings:settings[0]??null,canAct:session.user.role!=="viewer"};
}
