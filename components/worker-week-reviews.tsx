import { and, desc, eq, ne, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { workerWeekSheets, workers, projects, users } from "@/lib/db/schema";
import { requireModuleRead } from "@/lib/auth/guards";
import { isoWeek,totalWeekHours } from "@/lib/worker-week";
import { formatEUR } from "@/lib/utils";
import { WorkerWeekReviewForm } from "./worker-week-review-form";

export async function WorkerWeekReviews({projectId,invoicesOnly=false,pendingOnly=false}:{projectId?:string;invoicesOnly?:boolean;pendingOnly?:boolean}) {
 const access=await requireModuleRead(invoicesOnly?"inkoop":"projects");
 const rows=await db.select({sheet:workerWeekSheets,workerName:workers.name,projectName:projects.name}).from(workerWeekSheets).innerJoin(workers,eq(workers.id,workerWeekSheets.workerId)).innerJoin(projects,eq(projects.id,workerWeekSheets.projectId)).where(and(projectId?eq(workerWeekSheets.projectId,projectId):undefined,invoicesOnly?eq(workerWeekSheets.invoiceStatus,"submitted"):pendingOnly?eq(workerWeekSheets.status,"submitted"):ne(workerWeekSheets.status,"draft"))).orderBy(desc(workerWeekSheets.updatedAt)).limit(100);
 if(!rows.length)return pendingOnly?<p className="rounded-xl border bg-surface p-6 text-sm text-muted">Er staan geen weekstaten klaar om te controleren.</p>:null;
 const actorIds=[...new Set(rows.flatMap(r=>r.sheet.history.map(h=>h.actor)).filter(a=>/^[0-9a-f-]{36}$/.test(a)))];
 const actorNames=new Map(actorIds.length?(await db.select({id:users.id,name:users.name}).from(users).where(inArray(users.id,actorIds))).map(u=>[u.id,u.name??"Kantoor"]):[]);
 const labels:Record<string,string>={submitted:"Te controleren",approved:"Goedgekeurd",returned:"Teruggestuurd"};
 return <section id="weekstaten" className="my-5 space-y-3"><h2 className="text-lg font-semibold">{invoicesOnly?"Facturen uit het urenportaal ter controle":"Weekstaten uit het urenportaal"} <span className="text-sm font-normal text-muted">({rows.length})</span></h2>
 <p className="text-sm text-muted">{invoicesOnly?"Pas na goedkeuring wordt de factuur geboekt. De bijbehorende uren worden gekoppeld, niet opnieuw aangemaakt.":"Controleer aanwezigheid en resultaat per dag. Goedgekeurde weekstaten blijven vaststaan; concepten en ingediende staten tellen nog niet mee in de kosten."}</p>
 {rows.map(({sheet:s,workerName,projectName})=>{const wk=isoWeek(s.weekStart);const late=s.submittedAt && new Date(s.submittedAt).getTime()-Date.parse(s.weekStart)>10*86400000;return <details id={`weekstaat-${s.id}`} key={`${s.id}:${s.version}`} open={invoicesOnly || s.status==="submitted"} className="scroll-mt-24 rounded-xl border bg-surface p-4">
 <summary className="cursor-pointer font-medium">{workerName} · week {wk.week}/{wk.year} · {totalWeekHours(s.days)} persoonsuren · {labels[invoicesOnly?s.invoiceStatus!:s.status]}{s.invoice && ` · factuur ${s.invoice.number}`}</summary>
 <div className="mt-4 space-y-3"><Link href={`/projects/${s.projectId}#weekstaten`} className="text-sm text-accent underline">{projectName}</Link>
 <p className="text-sm text-muted">Ingediend: {s.submittedAt?.toLocaleString("nl-NL",{timeZone:"Europe/Madrid"})??"—"} · Tarief: {formatEUR(s.hourlyRate)}/u · Totaal arbeid: {formatEUR(totalWeekHours(s.days)*Number(s.hourlyRate))}</p>
 {late && <p className="text-sm font-medium text-amber-700">Late invoer: meer dan 3 dagen na het einde van de week. Extra controle aanbevolen.</p>}
 {s.reviewNote && <p className="text-sm whitespace-pre-wrap">{s.reviewNote}</p>}
 <div className="divide-y rounded-lg border">{s.days.map(d=><div key={d.date} className="p-3 text-sm"><p className="font-semibold">{d.date} · {d.state==="work"?"Gewerkt":d.state==="off"?"Niet gewerkt":"Nog niet verstreken / niet ingevuld"}</p>{d.note && <p>{d.note}</p>}{d.state==="work" && d.crews.map((c,i)=><div key={i} className="mt-2 border-l-2 border-accent pl-3"><p>{c.people} mensen × {c.hours} u = <strong>{c.people*c.hours} persoonsuren</strong>{c.hours>10 && <span className="ml-2 font-medium text-amber-700">Lange werkdag</span>}</p><p className="whitespace-pre-wrap">{c.names}</p>{c.zone && <p className="mt-1 font-medium">{c.zone}</p>}<p className="whitespace-pre-wrap">{c.description}</p></div>)}</div>)}</div>
 {!invoicesOnly && s.status==="submitted" && access.heeftCap("schrijven") && <WorkerWeekReviewForm id={s.id} projectId={s.projectId} version={s.version} invoice={false}/>}
 {s.invoice && <div className="space-y-2 rounded-lg bg-background p-4"><h3 className="font-semibold">Factuur {s.invoice.number} · {labels[s.invoiceStatus!]}</h3><p className="text-sm whitespace-pre-wrap">{s.invoice.legalName} · {s.invoice.taxId}<br/>{s.invoice.address}<br/>{s.invoice.email}<br/>IBAN: {s.invoice.iban||"—"}</p><p className="text-sm">Excl. btw: {formatEUR(s.invoice.subtotal)} · IVA {s.invoice.vatRate}%: {formatEUR(s.invoice.vat)} · IRPF {s.invoice.withholdingRate}%: {formatEUR(s.invoice.withholding)} · Te betalen: <strong>{formatEUR(s.invoice.total)}</strong></p><p className="text-sm whitespace-pre-wrap">{s.invoice.taxNote}</p>
 <a className="inline-block text-sm text-accent underline" href={`/api/worker-weeks/${s.id}/invoice`}>Factuur-PDF bekijken</a>
 {s.purchaseOrderId && <Link className="ml-3 text-sm text-accent underline" href={`/inkooporders/${s.purchaseOrderId}`}>Geboekte inkoopfactuur</Link>}
 {s.invoiceReviewNote && <p className="text-sm whitespace-pre-wrap">{s.invoiceReviewNote}</p>}
 {invoicesOnly && s.invoiceStatus==="submitted" && access.heeftCap("schrijven") && <WorkerWeekReviewForm id={s.id} projectId={s.projectId} version={s.version} invoice/>}
 {!invoicesOnly && s.invoiceStatus==="submitted" && <Link className="block text-sm text-accent underline" href="/inkooporders/te-verwerken">Factuur controleren in Inkoop</Link>}
 </div>}
 <details className="text-xs text-muted"><summary className="cursor-pointer">Wijzigingshistorie ({s.history.length})</summary>{s.history.map((h,i)=><div className="mt-2 border-t py-2" key={i}><p>{new Date(h.at).toLocaleString("nl-NL",{timeZone:"Europe/Madrid"})} · {h.action} · versie {h.version} · {actorNames.get(h.actor)??h.actor}</p>{h.reason && <p className="whitespace-pre-wrap">{h.reason}</p>}{h.days && <details><summary>Ingediende gegevens</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(h.days,null,2)}</pre></details>}{h.invoice && <details><summary>Ingediende factuurgegevens</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(h.invoice,null,2)}</pre></details>}</div>)}</details>
 </div></details>;})}</section>;
}
