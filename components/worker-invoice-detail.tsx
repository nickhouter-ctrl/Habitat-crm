import Link from "next/link";
import type { WeekDay, WeekLang, WorkerInvoice } from "@/lib/worker-week";
import { weekT } from "@/lib/worker-week-i18n";
import { dashboardT } from "@/lib/worker-dashboard-i18n";

export function WorkerInvoiceDetail({invoice:i,days,lang,downloadUrl,weekUrl}:{invoice:WorkerInvoice;days:WeekDay[];lang:WeekLang;downloadUrl:string;weekUrl:string}) {
  const t=(key:Parameters<typeof dashboardT>[1])=>dashboardT(lang,key);
  const eur=(n:number)=>new Intl.NumberFormat(lang,{style:"currency",currency:"EUR"}).format(n);
  return <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <div className="border-b border-stone-200 px-5 py-6 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">{t("document")}</p>
      <h2 className="mt-2 break-words text-2xl font-semibold">{i.number}</h2>
      <p className="mt-1 text-sm text-stone-500">{weekT(lang,"invoiceDate")}: {i.date}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <a href={downloadUrl} className="rounded-lg bg-[#a94f2d] px-4 py-3 text-sm font-semibold text-white">{weekT(lang,"pdf")}</a>
        <a href={`${downloadUrl}?view=inline`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-stone-300 px-4 py-3 text-sm font-medium">{t("viewPdf")}</a>
      </div>
    </div>
    <div className="space-y-7 px-5 py-6 sm:px-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="min-w-0"><h3 className="text-xs font-semibold uppercase tracking-widest text-stone-500">{t("issuer")}</h3><p className="mt-2 break-words text-lg font-semibold">{i.legalName}</p><p className="mt-1 text-sm">NIF / CIF / NIE: {i.taxId}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{i.address}</p><p className="mt-1 break-all text-sm">{i.email}</p></section>
        <section className="min-w-0"><h3 className="text-xs font-semibold uppercase tracking-widest text-stone-500">{t("customer")}</h3><p className="mt-2 break-words font-semibold">{i.customer.name}</p><p className="mt-1 text-sm">NIF / CIF: {i.customer.taxId}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{i.customer.address}</p></section>
      </div>
      <section><h3 className="font-semibold">{t("details")}</h3><p className="mt-1 text-sm text-stone-500">{i.projectName}</p><div className="mt-3 divide-y border-y border-stone-200">{days.filter(d=>d.state==="work").map(d=><div key={d.date} className="space-y-2 py-4"><p className="text-sm font-semibold">{d.date}</p>{d.crews.map((c,n)=><div key={n} className="space-y-1 text-sm"><p className="whitespace-pre-wrap">{c.zone && `${c.zone} · `}{c.description}</p><p className="text-stone-500">{c.names.replace(/\n/g,", ")} · {c.people} × {c.hours} h · {eur(i.rate)}/h</p></div>)}</div>)}</div></section>
      <dl className="ml-auto max-w-sm space-y-2 text-sm">{[[weekT(lang,"subtotal"),eur(i.subtotal)],[`IVA ${i.vatRate}%`,eur(i.vat)],[`IRPF ${i.withholdingRate}%`,`− ${eur(i.withholding)}`]].map(([label,value])=><div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{value}</dd></div>)}<div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-lg font-semibold"><dt>{weekT(lang,"amount")}</dt><dd>{eur(i.total)}</dd></div></dl>
      {i.taxNote && <p className="whitespace-pre-wrap text-sm text-stone-600">{i.taxNote}</p>}{i.iban && <p className="break-all text-sm">IBAN: {i.iban}</p>}
      <Link href={weekUrl} className="inline-block text-sm font-medium text-[#a94f2d] underline">{t("openWeek")} →</Link>
    </div>
  </article>;
}
