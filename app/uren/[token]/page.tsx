import { and, desc, eq, gte, isNull } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { timeEntries, workerWeekSheets } from "@/lib/db/schema";
import { portalLinkForToken } from "@/lib/worker-portal";
import { WorkerWeekForm, WorkerInvoiceForm } from "@/components/worker-week-form";
import { madridToday,mondayOf,addDays,isoWeek,emptyWeek,weekLang,totalWeekHours } from "@/lib/worker-week";
import { weekT, type WeekCopyKey } from "@/lib/worker-week-i18n";
export const dynamic="force-dynamic";
type Props={params:Promise<{token:string}>;searchParams:Promise<{lang?:string;week?:string}>};
export async function generateMetadata({params,searchParams}:Props) {
  const {token}=await params,query=await searchParams;const ctx=await portalLinkForToken(token).catch(()=>null);
  const lang=weekLang(query.lang??ctx?.worker.portalLang);
  return {title:ctx?`${weekT(lang,"title")} — ${ctx.project.name}`:"Portal",robots:{index:false,follow:false},referrer:"no-referrer"};
}
export default async function UrenPortaalPage({params,searchParams}:Props) {
  const {token}=await params,query=await searchParams;const ctx=await portalLinkForToken(token);
  if(!ctx)return <main className="p-10"><h1 className="text-xl">Link niet geldig / Enlace no válido</h1><p>Vraag kantoor om een nieuwe link. / Pide un enlace nuevo a la oficina.</p></main>;
  const {worker,project}=ctx,lang=weekLang(query.lang??worker.portalLang),today=madridToday();
  const t=(key:WeekCopyKey)=>weekT(lang,key);const current=mondayOf(today);
  const weeks=Array.from({length:9},(_,i)=>addDays(current,-7*i));const selected=weeks.includes(query.week??"")?query.week!:current;
  const [sheets,legacy]=await Promise.all([
    db.select().from(workerWeekSheets).where(and(eq(workerWeekSheets.workerId,worker.id),eq(workerWeekSheets.projectId,project.id),gte(workerWeekSheets.weekStart,weeks[8]))).orderBy(desc(workerWeekSheets.weekStart)),
    db.select({date:timeEntries.date,hours:timeEntries.hours,note:timeEntries.note}).from(timeEntries).where(and(eq(timeEntries.workerId,worker.id),eq(timeEntries.projectId,project.id),isNull(timeEntries.weekSheetId),gte(timeEntries.date,selected))).orderBy(desc(timeEntries.date)).limit(100),
  ]);
  const sheet=sheets.find(s=>s.weekStart===selected);const locked=!!sheet && ["submitted","approved"].includes(sheet.status);
  const week=isoWeek(selected);const locale=lang==="nl"?"nl-NL":lang==="es"?"es-ES":"en-GB";
  const date=(s:string)=>new Date(`${s}T12:00:00Z`).toLocaleDateString(locale,{day:"numeric",month:"short"});
  const status=(s:string)=>t(s==="submitted"?"pending":s as WeekCopyKey);
  return <main lang={lang} className="min-h-screen bg-[#f4f0e9] px-4 py-7 text-stone-900 sm:py-10"><div className="mx-auto max-w-2xl space-y-6">
    <header className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold tracking-[.2em] text-stone-500">HABITAT ONE · {worker.name}</span><nav aria-label="Language" className="flex gap-1">{(["nl","es","en"] as const).map(l=><Link key={l} href={`?lang=${l}&week=${selected}`} className={`rounded-md px-3 py-2 text-sm ${lang===l?"bg-stone-800 text-white":"bg-white text-stone-700"}`}>{l==="es"?"Español":l==="nl"?"NL":"EN"}</Link>)}</nav></div>
      <p className="text-sm font-medium text-[#a94f2d]">{project.name}</p><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="text-sm leading-relaxed text-stone-600">{t("intro")}</p>
    </header>
    <section aria-label={t("choose")} className="rounded-xl border border-stone-200 bg-white p-4"><form method="get" className="flex flex-col items-end gap-3 sm:flex-row"><input type="hidden" name="lang" value={lang}/><label className="w-full min-w-0 flex-1 text-sm font-medium">{t("choose")}<select name="week" defaultValue={selected} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3 text-base">{weeks.map(w=>{const n=isoWeek(w),s=sheets.find(row=>row.weekStart===w);return <option key={w} value={w}>{t("week")} {n.week} · {n.year} · {date(w)}–{date(addDays(w,6))}{s?` · ${status(s.status)}`:""}</option>;})}</select></label><button className="rounded-lg bg-stone-800 px-4 py-3 text-sm font-semibold text-white">{t("choose")}</button></form></section>
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">{t("week")} {week.week} · {week.year}</h2><p className="mt-1 text-sm text-stone-500">{date(selected)} – {date(addDays(selected,6))}</p></div><span className="rounded-full bg-white px-3 py-1 text-sm font-medium">{status(sheet?.status??"draft")}</span></div>
    {sheet?.reviewNote && <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm whitespace-pre-wrap">{sheet.reviewNote}</p>}
    <WorkerWeekForm key={selected} token={token} lang={lang} monday={selected} version={sheet?.version??0} initialDays={sheet?.days??emptyWeek(selected)} locked={locked} today={today}/>
    {worker.portalInvoiceEnabled && <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5"><h2 className="text-xl font-semibold">{t("invoice")}</h2>
      {sheet?.invoiceStatus && <p className="font-medium">{status(sheet.invoiceStatus)}</p>}
      {sheet?.invoiceReviewNote && <p className="rounded-lg bg-amber-50 p-3 text-sm whitespace-pre-wrap">{sheet.invoiceReviewNote}</p>}
      {sheet?.invoice && <a className="inline-block rounded-lg border px-4 py-3 text-sm font-medium" href={`/uren/${token}/factuur/${sheet.id}`}>{t("pdf")}</a>}
      {sheet?.status==="approved" && (!sheet.invoiceStatus || sheet.invoiceStatus==="returned")?<WorkerInvoiceForm key={sheet.version} token={token} lang={lang} id={sheet.id} version={sheet.version} hours={totalWeekHours(sheet.days)} rate={Number(sheet.hourlyRate)} today={today} previous={sheet.invoice}/>:<p className="text-sm text-stone-600">{t("invoiceIntro")}</p>}
    </section>}
    {legacy.filter(e=>e.date<=addDays(selected,6)).length>0 && <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">{t("old")}</h2><p className="text-sm">{t("olderHint")}</p>{legacy.filter(e=>e.date<=addDays(selected,6)).map((e,i)=><p key={i} className="text-sm">{date(e.date)} · {e.hours} h · {e.note}</p>)}</section>}
  </div></main>;
}
