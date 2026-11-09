"use client";
import { useActionState, useState, useEffect, useRef } from "react";
import { saveWeekAction, submitWeekInvoiceAction } from "@/app/uren/[token]/week-actions";
import { addDays, periodRange, totalWeekHours, invoiceAmounts, validateWeek, type WeekDay, type WeekLang, type WorkerInvoice } from "@/lib/worker-week";
import type { SupplierDetails } from "@/lib/worker-portal-dashboard";
import { weekT, weekError, type WeekCopyKey } from "@/lib/worker-week-i18n";

import { weekRoster, dayDescription, personHours, gridDay } from "@/lib/worker-week-grid";

const input="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 focus:border-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:bg-stone-100";
const button="rounded-lg bg-[#a94f2d] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50";
const secondary="rounded-lg border border-stone-300 px-4 py-3 text-sm font-medium disabled:opacity-50";
export function WorkerWeekForm({token,lang,monday,version,initialDays,initialRoster=[],locked,today,invoice}:{token:string;lang:WeekLang;monday:string;version:number;initialDays:WeekDay[];initialRoster?:string[];locked:boolean;today:string;
  /** Factureert deze arbeider zelf? Dan gaat de factuur mee bij het indienen. */
  invoice?:{rate:number;previous:WorkerInvoice|null;supplier?:SupplierDetails}}) {
  const t=(key:WeekCopyKey)=>weekT(lang,key);
  const [days,setDays]=useState(initialDays);
  const [names,setNames]=useState(()=>weekRoster(initialDays,initialRoster));
  const [nextDate,setNextDate]=useState(()=>addDays(initialDays.at(-1)!.date,1));
  const [newName,setNewName]=useState("");
  const [review,setReview]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(()=>JSON.stringify({days:initialDays,names:weekRoster(initialDays,initialRoster)}));
  const [active,setActive]=useState(()=>Math.max(0,initialDays.findIndex(d=>d.date===today)));
  const formRef=useRef<HTMLFormElement>(null);
  const snapshot=JSON.stringify({days,names}),dirty=snapshot!==saved;
  const [state,action,pending]=useActionState(async(prev:Awaited<ReturnType<typeof saveWeekAction>>,form:FormData)=>{
    const result=await saveWeekAction(token,prev,form);
    if(result?.ok){const savedDays=result.days??JSON.parse(String(form.get("days")));setDays(savedDays);setSaved(JSON.stringify({days:savedDays,names:JSON.parse(String(form.get("roster")))}));setReview(false);}
    return result;
  },null);
  useEffect(()=>{
    if(!dirty||locked)return;
    const before=(e:BeforeUnloadEvent)=>{e.preventDefault();};
    const click=(e:MouseEvent)=>{if((e.target as Element).closest("a[href]")&&!window.confirm(weekT(lang,"leave"))){e.preventDefault();e.stopPropagation();}};
    const submit=(e:Event)=>{if(e.target!==formRef.current&&!window.confirm(weekT(lang,"leave"))){e.preventDefault();e.stopPropagation();}};
    window.addEventListener("beforeunload",before);document.addEventListener("click",click,true);document.addEventListener("submit",submit,true);
    return()=>{window.removeEventListener("beforeunload",before);document.removeEventListener("click",click,true);document.removeEventListener("submit",submit,true);};
  },[dirty,locked,lang]);
  const locale=lang==="nl"?"nl-NL":lang==="es"?"es-ES":"en-GB";
  const change=(i:number,day:WeekDay)=>{setDays(old=>old.map((d,n)=>n===i?day:d));setReview(false);setError("");};
  const check=()=>{const result=validateWeek(days,monday,today,true);if(result.error){setError(weekError(lang,result.error));const i=days.findIndex(d=>d.state==="empty"||d.state==="work"&&d.crews.some(c=>c.description.length<10));if(i>=0)setActive(i);return;}setError("");setReview(true);};
  return <form ref={formRef} action={action} onReset={event=>event.preventDefault()} className="space-y-4 pb-4">
    <input type="hidden" name="lang" value={lang}/><input type="hidden" name="monday" value={monday}/><input type="hidden" name="version" value={Math.max(version,state?.version??0)}/><input type="hidden" name="days" value={JSON.stringify(days)}/><input type="hidden" name="roster" value={JSON.stringify(names)}/>
    <fieldset disabled={locked||pending} className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <legend className="px-2 font-semibold">{t("team")}</legend><p className="mb-3 text-sm text-stone-600">{t("teamHint")}</p>
      <div className="flex flex-wrap gap-2">{names.map(name=><span key={name} className="inline-flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 font-medium">{name}{!locked&&<button type="button" aria-label={`${t("remove")} ${name}`} disabled={days.some(d=>personHours(d,name)>0)} className="px-1 text-stone-500 disabled:hidden" onClick={()=>setNames(old=>old.filter(n=>n!==name))}>×</button>}</span>)}</div>
      {!locked&&<div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">{t("personName")}<input className={input} value={newName} maxLength={100} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();formRef.current?.querySelector<HTMLButtonElement>("[data-add-person]")?.click();}}}/></label><button data-add-person type="button" className={secondary} disabled={!newName.trim()||names.length>=30} onClick={()=>{const name=newName.trim();if(names.some(n=>n.toLowerCase()===name.toLowerCase()))return;if(/[\n;,]/.test(name))return;setNames(old=>[...old,name]);setNewName("");}}>{t("addPerson")}</button></div>}
    </fieldset>
    <div><p className="mb-2 font-semibold">{periodRange(monday,lang,days.at(-1)?.date)}</p><p className="text-sm text-stone-600">{t("hoursHint")}</p></div>
    {days.map((day,i)=>{const future=day.date>today,description=dayDescription(day),hours=names.map(n=>personHours(day,n));const dayTotal=totalWeekHours([day]);
      return <section key={day.date} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <button type="button" aria-expanded={active===i} aria-controls={`day-${i}`} onClick={()=>setActive(active===i?-1:i)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span><span className="block font-semibold capitalize">{new Date(`${day.date}T12:00:00Z`).toLocaleDateString(locale,{weekday:"long",day:"numeric",month:"short"})}{day.date===today&&<span className="ml-2 rounded-full bg-[#a94f2d] px-2 py-1 text-xs text-white">{t("today")}</span>}</span><span className={`mt-1 block text-sm ${day.state==="empty"?"text-stone-500":day.state==="work"&&description.length<10?"text-amber-800":"text-emerald-800"}`}>{day.state==="empty"?t("empty"):day.state==="off"?t("off"):`${dayTotal.toLocaleString(locale)} h · ${description.length<10?t("descriptionNeeded"):t("filled")}`}</span></span><span aria-hidden="true">{active===i?"−":"+"}</span></button>
        {active===i&&<fieldset id={`day-${i}`} disabled={locked||pending} className="space-y-4 border-t border-stone-200 p-4">
          {future?<p className="text-sm text-stone-500">{t("future")}</p>:<>
            {!names.length&&<p className="text-sm text-stone-600">{t("addNamesFirst")}</p>}
            {names.map((name,j)=><label key={name} className="flex items-center justify-between gap-3"><span className="font-medium">{name}</span><span className="flex items-center gap-2"><input aria-label={`${name} ${day.date}`} className={`${input} !mt-0 !w-24 text-center font-semibold`} type="number" inputMode="decimal" min="0" max="16" step="0.25" value={hours[j]||""} placeholder="0" onChange={e=>{const next=[...hours];next[j]=Number(e.target.value);change(i,gridDay(day,names,next,description));}}/><span className="text-sm">h</span></span></label>)}
            {(day.state==="work"||dayTotal>0)&&<label className="block text-sm font-semibold">{t("description")} <span className="text-[#a94f2d]">*</span><textarea aria-label={`${t("description")} ${day.date}`} className={input} rows={3} maxLength={2000} value={description} placeholder={t("descriptionHint")} onChange={e=>change(i,gridDay(day,names,hours,e.target.value))}/></label>}
          </>}
          {!locked&&<button type="button" className={secondary} onClick={()=>{if(dayTotal>0&&!window.confirm(t("clearDay")))return;change(i,{...day,state:"off",crews:[]});}}>{t("off")}</button>}
          {!locked&&i===days.length-1&&i>0&&<button type="button" className="ml-3 text-sm text-stone-600 underline" onClick={()=>{if(dayTotal>0&&!window.confirm(t("clearDay")))return;setDays(old=>old.slice(0,-1));setNextDate(day.date);setActive(i-1);setReview(false);setError("");}}>{t("removeDay")}</button>}
          {day.note&&<p className="text-sm text-stone-500">{day.note}</p>}
        </fieldset>}
      </section>;
    })}
    {!locked&&<fieldset disabled={pending} className="rounded-2xl border border-stone-200 bg-white p-4"><div className="flex flex-col items-end gap-3 sm:flex-row"><label className="w-full min-w-0 flex-1 text-sm font-medium">{t("nextDate")}<input className={input} type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}/></label><button type="button" className={secondary} disabled={days.length>=31||!nextDate||nextDate<=days.at(-1)!.date||nextDate>today||nextDate>addDays(monday,56)} onClick={()=>{setDays(old=>[...old,{date:nextDate,state:"empty",crews:[],note:""}]);setActive(days.length);setNextDate(addDays(nextDate,1));setReview(false);setError("");}}>{t("addDay")}</button></div><p className="mt-2 text-sm text-stone-500">{t("addDayHint")}</p></fieldset>}
    {error&&<p role="alert" className="rounded-xl bg-amber-50 p-4 font-medium text-amber-900">{error}</p>}
    {review&&!locked&&<section className="space-y-4 rounded-2xl border-2 border-[#a94f2d] bg-white p-5"><h3 className="text-xl font-semibold">{t("reviewTitle")}</h3><p>{totalWeekHours(days).toLocaleString(locale)} h · {t("reviewHint")}</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 size-5 shrink-0 accent-[#a94f2d]"/>{t("confirm")}</label>{invoice&&<div className="space-y-4 border-t border-stone-200 pt-4"><input type="hidden" name="withInvoice" value="1"/><h4 className="font-semibold">{t("invoiceWithWeek")}</h4><p className="text-sm text-stone-600">{t("invoiceWithWeekHint")}</p><InvoiceFields lang={lang} hours={totalWeekHours(days)} rate={invoice.rate} today={today} previous={invoice.previous} supplier={invoice.supplier} confirmName="invoiceConfirmed"/></div>}<button type="submit" name="intent" value="submit" className={`${button} w-full`} disabled={pending}>{pending?t("busy"):t("submit")}</button><button type="button" className={`${secondary} w-full`} onClick={()=>setReview(false)}>{t("backToEdit")}</button></section>}
    <div className="sticky bottom-0 z-10 rounded-2xl border border-stone-300 bg-[#f4f0e9] p-4 shadow-lg">
      <div className="mb-3 flex justify-between gap-3"><span className="text-sm font-semibold">{t("total")}</span><strong>{totalWeekHours(days).toLocaleString(locale)} h</strong></div>
      {locked?<p className="text-sm text-stone-600">{t("locked")}</p>:<><button type="submit" name="intent" value="draft" formNoValidate disabled={pending} className={`${button} w-full`}>{pending?t("busy"):t("save")}</button><p role="status" className={`mt-2 text-center text-sm ${dirty?"text-amber-900":"text-emerald-800"}`}>{dirty?t("unsaved"):state?.ok??t("saveHint")}</p>{!review&&<button type="button" disabled={pending} onClick={check} className="mt-3 w-full py-2 text-sm font-semibold text-[#a94f2d] underline">{t("submit")}</button>}</>}
      {state?.error&&<p role="alert" className="mt-3 text-sm font-medium text-red-800">{state.error}</p>}
    </div>
  </form>;
}
/** Volgend factuurnummer voorstellen: "FAC-22" → "FAC-23", "0009" → "0010". */
export function nextInvoiceNumber(last?:string|null) {
  const m=last?.match(/^(.*?)(\d+)(\D*)$/);
  if(!m)return "";
  const n=String(Number(m[2])+1).padStart(m[2].length,"0");
  return `${m[1]}${n}${m[3]}`;
}
function InvoiceFields({lang,hours,rate,today,previous,supplier,confirmName}:{lang:WeekLang;hours:number;rate:number;today:string;previous:WorkerInvoice|null;supplier?:SupplierDetails;confirmName:string}) {
  const t=(key:WeekCopyKey)=>weekT(lang,key);
  const vorige=previous??(supplier?{...supplier}:null);
  const [vat,setVat]=useState(vorige?.vatRate!=null&&!Number.isNaN(vorige.vatRate)?String(vorige.vatRate):"");const [withholding,setWithholding]=useState(vorige?.withholdingRate!=null&&!Number.isNaN(vorige.withholdingRate)?String(vorige.withholdingRate):"");
  const amounts=invoiceAmounts(hours,rate,Number(vat),Number(withholding));
  const eur=(v:number)=>new Intl.NumberFormat(lang,{style:"currency",currency:"EUR"}).format(v);
  const defaults:Partial<WorkerInvoice>={...supplier,number:nextInvoiceNumber(supplier?.lastNumber),date:today,...(previous??{})};
  const fields:[keyof WorkerInvoice,WeekCopyKey,string,number][]=[["legalName","legalName","text",180],["taxId","taxId","text",40],["address","address","text",350],["email","email","email",180],["iban","iban","text",40],["number","number","text",64],["date","invoiceDate","date",10]];
  return <>
    {supplier && !previous && <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">{t("profilePrefilled")}</p>}
    {fields.map(([name,label,type,max])=><label key={name} className="block text-sm font-medium">{t(label)}<input className={input} name={name} type={type} maxLength={max} required={name!=="iban"} max={name==="date"?today:undefined} defaultValue={String(defaults[name]??"")}/></label>)}
    <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{t("vat")}<select aria-label={t("vat")} className={input} name="vatRate" value={vat} required onChange={e=>setVat(e.target.value)}><option value="">{t("taxChoice")}</option>{[0,4,10,21].map(v=><option key={v} value={v}>{v}%</option>)}</select></label>
    <label className="text-sm font-medium">{t("withholding")}<select aria-label={t("withholding")} className={input} name="withholdingRate" value={withholding} required onChange={e=>setWithholding(e.target.value)}><option value="">{t("taxChoice")}</option>{[0,7,15,19].map(v=><option key={v} value={v}>{v}%</option>)}</select></label></div>
    <label className="block text-sm font-medium">{t("taxNote")}<textarea className={input} name="taxNote" maxLength={500} rows={2} required={vat==="0"} defaultValue={previous?.taxNote??supplier?.taxNote??""}/></label>
    <dl className="space-y-2 rounded-lg bg-stone-100 p-4 text-sm">{[[t("rate"),eur(rate)],[t("total"),`${hours} h`],[t("subtotal"),eur(amounts.subtotal)],[t("vat"),eur(amounts.vat)],[t("withholding"),`− ${eur(amounts.withholding)}`],[t("amount"),eur(amounts.total)]].map(([label,value])=><div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
    <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-5 shrink-0 accent-[#a94f2d]" type="checkbox" name={confirmName} required/>{t("invoiceConfirm")}</label>
  </>;
}
export function WorkerInvoiceForm({token,lang,id,version,hours,rate,today,previous,supplier}:{token:string;lang:WeekLang;id:string;version:number;hours:number;rate:number;today:string;previous:WorkerInvoice|null;supplier?:SupplierDetails}) {
  const t=(key:WeekCopyKey)=>weekT(lang,key);
  const [state,action,pending]=useActionState(submitWeekInvoiceAction.bind(null,token),null);
  return <form action={action} onReset={event=>event.preventDefault()} className="space-y-4">
    <input type="hidden" name="lang" value={lang}/><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/>
    <p className="text-sm leading-relaxed text-stone-600">{t("invoiceIntro")}</p>
    <fieldset disabled={pending} className="space-y-4"><legend className="mb-3 font-semibold">{t("issuer")}</legend>
      <InvoiceFields lang={lang} hours={hours} rate={rate} today={today} previous={previous} supplier={supplier} confirmName="confirmed"/>
      <button className={button} disabled={pending||rate<=0}>{pending?t("busy"):t("sendInvoice")}</button>
    </fieldset>
    {state?.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}{state?.ok && <p role="status" className="text-sm text-green-800">{state.ok}</p>}
  </form>;
}
