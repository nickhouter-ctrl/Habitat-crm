import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { portalLinkForToken } from "@/lib/worker-portal";
import { weekRoster } from "@/lib/worker-week-grid";
import { WorkerWeekForm, WorkerInvoiceForm } from "@/components/worker-week-form";
import { WorkerInvoiceDetail } from "@/components/worker-invoice-detail";
import { madridToday,emptyWeek,weekLang,totalWeekHours,periodRange } from "@/lib/worker-week";
import { weekT, type WeekCopyKey } from "@/lib/worker-week-i18n";
import { dashboardT, type DashboardCopyKey } from "@/lib/worker-dashboard-i18n";
import { loadWorkerDashboard, portalValue, type PortalQuery } from "@/lib/worker-portal-dashboard";
export const dynamic="force-dynamic";
type Props={params:Promise<{token:string}>;searchParams:Promise<PortalQuery>};
export async function generateMetadata({params,searchParams}:Props) {
  const {token}=await params,query=await searchParams;
  const ctx=await portalLinkForToken(token,{history:true}).catch(()=>null);
  const lang=weekLang(portalValue(query.lang)??ctx?.worker.portalLang);
  return {title:ctx?`${dashboardT(lang,"title")} — ${ctx.project.name}`:"Portal",robots:{index:false,follow:false},referrer:"no-referrer"};
}
const panel="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6";
const secondary="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-medium";

export default async function UrenPortaalPage({params,searchParams}:Props) {
  const {token}=await params,query=await searchParams;
  const ctx=await portalLinkForToken(token,{history:true});
  if(!ctx)return <main className="p-10"><h1 className="text-xl">Link niet geldig / Enlace no válido</h1><p>Vraag kantoor om een nieuwe link. / Pide un enlace nuevo a la oficina.</p></main>;
  const {worker,project}=ctx,lang=weekLang(portalValue(query.lang)??worker.portalLang),today=madridToday();
  const t=(key:WeekCopyKey)=>weekT(lang,key),d=(key:DashboardCopyKey)=>dashboardT(lang,key);
  const data=await loadWorkerDashboard(worker.id,project.id,today,query);
  const {view,current,selected,sheet,counts}=data;
  if(view==="invoice" && !data.invoiceSheet)notFound();
  if(view==="week" && !portalValue(query.week))redirect(`/uren/${token}?${new URLSearchParams({lang,view:"week",week:selected})}`);
  const active=project.status==="active",old=selected<data.earliest || selected>today;
  const locked=!active || old || !!sheet && ["submitted","approved"].includes(sheet.status);
  const locale=lang==="nl"?"nl-NL":lang==="es"?"es-ES":"en-GB";
  const date=(s:string)=>new Date(`${s}T12:00:00Z`).toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"});
  const eur=(n:number)=>new Intl.NumberFormat(locale,{style:"currency",currency:"EUR"}).format(n);
  const status=(s:string)=>t(s==="submitted"?"pending":s as WeekCopyKey);
  const href=(values:Record<string,string|number>)=>`/uren/${token}?${new URLSearchParams(Object.fromEntries(Object.entries({lang,...values}).map(([k,v])=>[k,String(v)])))}`;
  const pdf=(id:string)=>`/uren/${token}/factuur/${id}`;
  const pill=(s:string)=><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s==="approved"?"bg-emerald-50 text-emerald-800":s==="returned"?"bg-amber-50 text-amber-900":s==="submitted"?"bg-orange-50 text-orange-900":"bg-stone-100 text-stone-600"}`}>{status(s)}</span>;
  const rows=<div className="divide-y divide-stone-200">{data.rows.map(row=>{return <Link key={row.id} href={href({view:"week",week:row.weekStart})} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div><p className="font-semibold">{periodRange(row.weekStart,lang,row.days.at(-1)?.date)}</p><p className="mt-1 text-xs text-stone-500">{row.weekStart.slice(0,4)} · {totalWeekHours(row.days)} h</p></div><div className="flex items-center gap-3">{pill(row.status)}<span aria-hidden="true" className="text-stone-400">→</span></div></Link>;})}</div>;
  const pagination=data.pages>1?<nav aria-label={d("page")} className="flex items-center justify-between gap-3 text-sm">{data.page>1?<Link className={secondary} href={href({view,page:data.page-1,...(view==="week"?{week:selected}:{})})}>← {d("previous")}</Link>:<span/>}<span className="text-stone-500">{d("page")} {data.page} / {data.pages}</span>{data.page<data.pages?<Link className={secondary} href={href({view,page:data.page+1,...(view==="week"?{week:selected}:{})})}>{d("next")} →</Link>:<span/>}</nav>:null;
  const legacy=view==="week"?await db.select({date:timeEntries.date,hours:timeEntries.hours,note:timeEntries.note}).from(timeEntries).where(and(eq(timeEntries.workerId,worker.id),eq(timeEntries.projectId,project.id),isNull(timeEntries.weekSheetId),gte(timeEntries.date,selected),lte(timeEntries.date,sheet?.days.at(-1)?.date??selected))).orderBy(desc(timeEntries.date)).limit(100):[];
  return <main lang={lang} className="min-h-screen bg-[#f4f0e9] px-4 py-7 text-stone-900 sm:py-10"><div className="mx-auto max-w-3xl space-y-6">
    <header className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold tracking-[.16em] text-stone-500">HABITAT ONE · {worker.name}</span><nav aria-label="Language" className="flex gap-1">{(["nl","es","en"] as const).map(l=><Link key={l} href={href({view,lang:l,week:selected,page:data.page,...(data.invoiceSheet?{invoice:data.invoiceSheet.id}:{})})} className={`rounded-md px-3 py-2 text-sm ${lang===l?"bg-stone-800 text-white":"bg-white text-stone-700"}`}>{l==="es"?"Español":l==="nl"?"NL":"EN"}</Link>)}</nav></div>
      <div><p className="mb-2 text-sm font-medium text-[#a94f2d]">{project.name}</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{view==="week"?t("title"):view==="invoices"?d("invoiceTitle"):view==="invoice"?d("document"):d("title")}</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">{view==="week"?t("intro"):d("intro")}</p></div>
    </header>
    <nav aria-label={d("overview")} className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200 bg-[#eae4da] p-1">{([['overview',d('overview')],['week',d('weeks')],['invoices',d('invoices')]] as const).map(([v,label])=><Link key={v} href={href({view:v,...(v==="week"?{week:selected}:{})})} aria-current={view===v||(view==="invoice"&&v==="invoices")?"page":undefined} className={`rounded-lg px-2 py-3 text-center text-sm font-medium ${view===v||(view==="invoice"&&v==="invoices")?"bg-white text-stone-900 shadow-sm":"text-stone-600 hover:bg-white/60"}`}>{label}</Link>)}</nav>
    {!active && <p className="rounded-xl border border-stone-300 bg-white/60 p-4 text-sm leading-relaxed">{d("completed")}</p>}

    {view==="overview" && <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">{[[d("weeks"),counts.total,"week"],[t("pending"),counts.pending,"week"],[d("invoices"),counts.invoices,"invoices"]].map(([label,value,target])=><Link key={label} href={href({view:String(target)})} className="rounded-xl border border-stone-200 bg-white px-3 py-4 sm:p-5"><p className="text-xs leading-5 text-stone-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></Link>)}</div>
      {active && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#342b25] p-5 text-white sm:p-6"><div><p className="text-xs uppercase tracking-widest text-stone-300">{periodRange(current,lang)}</p><h2 className="mt-2 text-xl font-semibold">{d("current")}</h2><p className="mt-1 text-sm text-stone-300">{t("save")} · {t("submit")}</p></div><Link href={href({view:"week",week:current})} className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-stone-900">{d("current")} →</Link></section>}
      {counts.returned>0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{d("changes")}</p>}
      <section className={panel}><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{d("recent")}</h2><Link href={href({view:"week"})} className="text-sm text-[#a94f2d] underline">{d("allWeeks")}</Link></div>{data.rows.length?rows:<p className="text-sm text-stone-500">{d("noWeeks")}</p>}</section>
      {data.profile && <section className="rounded-xl border border-stone-200 p-5"><h2 className="font-semibold">{d("savedDetails")}</h2><p className="mt-2 text-sm">{data.profile.legalName} · {data.profile.taxId}</p><p className="mt-2 text-sm leading-relaxed text-stone-500">{d("savedHint")}</p></section>}
    </>}

    {view==="week" && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{periodRange(selected,lang,sheet?.days.at(-1)?.date)}</h2><p className="mt-1 text-sm text-stone-500">{selected.slice(0,4)}</p></div>{pill(sheet?.status??"draft")}</div>
      {old && <p className="rounded-xl bg-stone-200/60 p-4 text-sm">{d("older")}</p>}
      {sheet?.reviewNote && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm whitespace-pre-wrap">{sheet.reviewNote}</p>}
      <details open={!sheet} className={panel}><summary className="cursor-pointer font-semibold">{t("newPeriod")}</summary><form method="get" className="mt-3 flex flex-col items-end gap-3 sm:flex-row"><input type="hidden" name="lang" value={lang}/><input type="hidden" name="view" value="week"/><label className="w-full min-w-0 flex-1 text-sm font-medium">{t("startDate")}<input type="date" name="week" min={data.earliest} max={today} defaultValue={selected} required className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-3 text-base"/></label><button className="rounded-lg bg-stone-800 px-4 py-3 text-sm font-semibold text-white">{t("start")}</button></form></details>
      <WorkerWeekForm key={selected} token={token} lang={lang} monday={selected} version={sheet?.version??0} initialRoster={sheet?.roster?.length?sheet.roster:weekRoster(data.lastTeam?.days??[],data.lastTeam?.roster??[])} initialDays={sheet?.days??emptyWeek(selected).slice(0,1)} locked={locked} today={today}/>
      {(sheet?.invoice || worker.portalInvoiceEnabled && sheet?.status==="approved") && <section className={`${panel} space-y-4`}><h2 className="text-xl font-semibold">{sheet?.invoice?d("document"):t("invoice")}</h2>
        {sheet?.invoiceStatus && pill(sheet.invoiceStatus)}
        {sheet?.invoiceReviewNote && <p className="rounded-lg bg-amber-50 p-3 text-sm whitespace-pre-wrap">{sheet.invoiceReviewNote}</p>}
        {sheet?.invoice && <div><p className="mb-3 font-medium">{sheet.invoice.number} · {eur(sheet.invoice.total)}</p><div className="flex flex-wrap gap-2"><Link className={secondary} href={href({view:"invoice",invoice:sheet.id})}>{d("view")}</Link><a className={secondary} href={pdf(sheet.id)}>{t("pdf")}</a></div></div>}
        {active && worker.portalInvoiceEnabled && sheet?.status==="approved" && (!sheet.invoiceStatus || sheet.invoiceStatus==="returned")?<WorkerInvoiceForm key={`${sheet.id}:${sheet.version}`} token={token} lang={lang} id={sheet.id} version={sheet.version} hours={totalWeekHours(sheet.days)} rate={Number(sheet.hourlyRate)} today={today} previous={sheet.invoice} supplier={data.profile}/>:!sheet?.invoice && active?<p className="text-sm leading-relaxed text-stone-600">{t("invoiceIntro")}</p>:null}
      </section>}
      {legacy.length>0 && <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">{t("old")}</h2><p className="text-sm">{t("olderHint")}</p>{legacy.map((e,i)=><p key={i} className="text-sm">{date(e.date)} · {e.hours} h · {e.note}</p>)}</section>}

      <details className={panel}><summary className="cursor-pointer font-semibold">{d("history")}</summary><div className="mt-5">{data.rows.length?rows:<p className="text-sm text-stone-500">{d("noWeeks")}</p>}</div></details>{pagination}
    </>}

    {view==="invoices" && <>
      <p className="text-sm leading-relaxed text-stone-600">{d("invoiceHint")}</p>
      {data.rows.length?<div className="space-y-3">{data.rows.map(row=>{return <article key={row.id} className={panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-stone-500">{date(row.date??row.weekStart)} · {periodRange(row.weekStart,lang,row.days.at(-1)?.date)}</p><h2 className="mt-1 break-words text-xl font-semibold">{row.number}</h2></div><div className="text-right"><p className="mb-2 text-lg font-semibold tabular-nums">{eur(Number(row.amount))}</p>{pill(row.invoiceStatus??"submitted")}</div></div><div className="mt-4 flex flex-wrap gap-2"><Link className={secondary} href={href({view:"invoice",invoice:row.id})}>{d("view")}</Link><a className={secondary} href={pdf(row.id)}>{t("pdf")}</a></div></article>;})}</div>:<p className={panel}>{d("noInvoices")}</p>}{pagination}
    </>}

    {view==="invoice" && data.invoiceSheet?.invoice && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href={href({view:"invoices"})} className="text-sm text-[#a94f2d] underline">← {d("back")}</Link>{pill(data.invoiceSheet.invoiceStatus??"submitted")}</div>
      {data.invoiceSheet.invoiceReviewNote && <p className="rounded-xl bg-amber-50 p-4 text-sm whitespace-pre-wrap">{data.invoiceSheet.invoiceReviewNote}</p>}
      <WorkerInvoiceDetail invoice={data.invoiceSheet.invoice} days={data.invoiceSheet.days} lang={lang} downloadUrl={pdf(data.invoiceSheet.id)} weekUrl={href({view:"week",week:data.invoiceSheet.weekStart})}/>
    </>}
  </div></main>;
}
