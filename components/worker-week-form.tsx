"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveWeekAction, submitWeekInvoiceAction } from "@/app/uren/[token]/week-actions";
import { totalWeekHours, invoiceAmounts, type WeekDay, type WeekLang, type WorkerInvoice } from "@/lib/worker-week";
import type { SupplierDetails } from "@/lib/worker-portal-dashboard";
import { weekT, type WeekCopyKey } from "@/lib/worker-week-i18n";

const input="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 focus:border-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:bg-stone-100";
const button="rounded-lg bg-[#a94f2d] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50";
const secondary="rounded-lg border border-stone-300 px-4 py-3 text-sm font-medium disabled:opacity-50";
export function WorkerWeekForm({token,lang,monday,version,initialDays,locked,today}:{token:string;lang:WeekLang;monday:string;version:number;initialDays:WeekDay[];locked:boolean;today:string}) {
  const t=(key:WeekCopyKey)=>weekT(lang,key);
  const [days,setDays]=useState(initialDays);
  const [state,action,pending]=useActionState(saveWeekAction.bind(null,token),null);
  const changeDay=(index:number,update:Partial<WeekDay>)=>setDays(old=>old.map((d,i)=>i===index?{...d,...update}:d));
  const locale=lang==="nl"?"nl-NL":lang==="es"?"es-ES":"en-GB";
  const total=totalWeekHours(days);
  // De dag om nu in te vullen: vandaag, op zondag de zaterdag ervoor.
  const focusDate=days.some(d=>d.date===today)?(new Date(`${today}T12:00:00Z`).getUTCDay()===0?days[5].date:today):null;
  const focusRef=useRef<HTMLFieldSetElement>(null);
  useEffect(()=>{if(!locked)focusRef.current?.scrollIntoView({block:"start",behavior:"smooth"});},[locked]);
  // "Gewerkt" neemt de ploeg van de laatste werkdag ervoor over (zonder omschrijving).
  const setState=(i:number,state:WeekDay["state"])=>setDays(old=>old.map((d,k)=>{
    if(k!==i)return d;
    if(state!=="work")return {...d,state,crews:[]};
    const vorige=[...old.slice(0,i)].reverse().find(p=>p.state==="work"&&p.crews.length);
    return {...d,state,crews:d.crews.length?d.crews:vorige?vorige.crews.map(c=>({...c,description:""})):[{people:1,names:"",hours:8,description:"",zone:""}]};
  }));
  return <form action={action} onReset={event=>event.preventDefault()} className="space-y-5">
    <input type="hidden" name="lang" value={lang}/><input type="hidden" name="monday" value={monday}/><input type="hidden" name="version" value={version}/><input type="hidden" name="days" value={JSON.stringify(days)}/>
    <p className="text-sm leading-relaxed text-stone-600">{t("example")}</p>
    {days.map((day,i)=>{
      // Zondag alleen als er iets is ingevuld.
      if(i===6 && day.state==="empty")return null;
      const future=day.date>today,disabled=locked||pending,isFocus=day.date===focusDate;
      const copied=day.state==="work" && i>0 && day.crews.length>0 && day.crews.every(c=>!c.description) && days.slice(0,i).some(p=>p.state==="work");
      return <fieldset key={day.date} ref={isFocus?focusRef:undefined} disabled={disabled} className={`scroll-mt-4 rounded-xl border bg-white p-4 sm:p-5 disabled:opacity-70 ${isFocus?"border-[#a94f2d] ring-2 ring-orange-100":"border-stone-200"}`}>
        <legend className="px-2 text-base font-semibold capitalize">{new Date(`${day.date}T12:00:00Z`).toLocaleDateString(locale,{weekday:"long",day:"numeric",month:"short"})}{isFocus && <span className="ml-2 rounded-full bg-[#a94f2d] px-2 py-0.5 text-xs font-medium normal-case text-white">{t("today")}</span>}</legend>
        {future && <p className="mb-3 text-sm text-stone-500">{t("future")}</p>}<>
          <div role="group" aria-label={`${t("dayState")} ${day.date}`} className="grid grid-cols-2 gap-2">
            {(["work","off"] as const).map(s=><button key={s} type="button" aria-pressed={day.state===s} disabled={s==="work"&&future} onClick={()=>setState(i,day.state===s?"empty":s)} className={`rounded-lg border px-3 py-3 text-sm font-semibold disabled:opacity-40 ${day.state===s?"border-[#a94f2d] bg-[#a94f2d] text-white":"border-stone-300 bg-white text-stone-800"}`}>{t(s)}</button>)}
          </div>
          {copied && <p className="mt-3 text-sm text-stone-500">{t("sameCrew")}</p>}
          {day.state==="work" && <div className="mt-4 space-y-4">{day.crews.map((crew,j)=>{
            const update=(field:string,value:string|number)=>changeDay(i,{crews:day.crews.map((c,k)=>k===j?{...c,[field]:value}:c)});
            return <div key={j} className="space-y-3 border-t border-stone-200 pt-4">
              <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{t("people")}<input aria-label={`${t("people")} ${day.date} ${j+1}`} type="number" min="1" max="30" step="1" value={crew.people} onChange={e=>update("people",Number(e.target.value))} className={input}/></label>
              <label className="text-sm font-medium">{t("hours")}<input aria-label={`${t("hours")} ${day.date} ${j+1}`} type="number" inputMode="decimal" min="0.25" max="16" step="0.25" value={crew.hours} onChange={e=>update("hours",Number(e.target.value))} className={input}/></label></div>
              <label className="block text-sm font-medium">{t("names")}<textarea aria-label={t("names")} rows={Math.min(crew.people,4)} maxLength={1500} value={crew.names} onChange={e=>update("names",e.target.value)} className={input}/></label>
              <label className="block text-sm font-medium">{t("description")}<textarea aria-label={t("description")} rows={3} maxLength={2000} value={crew.description} placeholder={t("descriptionHint")} onChange={e=>update("description",e.target.value)} className={input}/></label>
              <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-medium tabular-nums">{crew.people} × {crew.hours} = {(crew.people*crew.hours).toLocaleString(locale)} h</span>{!locked && <button type="button" className="text-sm text-red-700 underline" onClick={()=>changeDay(i,{crews:day.crews.filter((_,k)=>k!==j)})}>{t("remove")}</button>}</div>
            </div>;
          })}{!locked && day.crews.length<12 && <button type="button" className={secondary} onClick={()=>changeDay(i,{crews:[...day.crews,{people:1,names:"",hours:8,description:"",zone:""}]})}>+ {t("add")}</button>}</div>}
          {day.state==="off" && <label className="mt-3 block text-sm">{t("note")}<input className={input} maxLength={500} value={day.note} onChange={e=>changeDay(i,{note:e.target.value})}/></label>}
        </>
      </fieldset>;
    })}
    <div className="rounded-xl border border-stone-200 bg-[#ede7dd] p-5"><div className="flex justify-between gap-4 font-semibold"><span>{t("total")}</span><span className="text-xl tabular-nums">{total.toLocaleString(locale)} h</span></div>
      {locked?<p className="mt-3 text-sm text-stone-600">{t("locked")}</p>:<>
        <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" className="mt-1 size-5 accent-[#a94f2d]"/>{t("confirm")}</label>
        <div className="mt-4 flex flex-wrap gap-3"><button className={secondary} type="submit" name="intent" value="draft" disabled={pending}>{pending?t("busy"):t("save")}</button><button className={button} type="submit" name="intent" value="submit" disabled={pending}>{pending?t("busy"):t("submit")}</button></div>
      </>}
      {state?.error && <p role="alert" className="mt-3 text-sm font-medium text-red-800">{state.error}</p>}{state?.ok && <p role="status" className="mt-3 text-sm font-medium text-green-800">{state.ok}</p>}
    </div>
  </form>;
}
export function WorkerInvoiceForm({token,lang,id,version,hours,rate,today,previous,supplier}:{token:string;lang:WeekLang;id:string;version:number;hours:number;rate:number;today:string;previous:WorkerInvoice|null;supplier?:SupplierDetails}) {
  const t=(key:WeekCopyKey)=>weekT(lang,key);
  const [state,action,pending]=useActionState(submitWeekInvoiceAction.bind(null,token),null);
  const [vat,setVat]=useState(previous?String(previous.vatRate):"");const [withholding,setWithholding]=useState(previous?String(previous.withholdingRate):"");
  const amounts=invoiceAmounts(hours,rate,Number(vat),Number(withholding));
  const eur=(v:number)=>new Intl.NumberFormat(lang,{style:"currency",currency:"EUR"}).format(v);
  const defaults:Partial<WorkerInvoice>={...supplier,date:today,...(previous??{})};
  const fields:[keyof WorkerInvoice,WeekCopyKey,string,number][]=[["legalName","legalName","text",180],["taxId","taxId","text",40],["address","address","text",350],["email","email","email",180],["iban","iban","text",40],["number","number","text",64],["date","invoiceDate","date",10]];
  return <form action={action} onReset={event=>event.preventDefault()} className="space-y-4">
    <input type="hidden" name="lang" value={lang}/><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/>
    <p className="text-sm leading-relaxed text-stone-600">{t("invoiceIntro")}</p>
    {supplier && !previous && <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">{t("profilePrefilled")}</p>}
    <fieldset disabled={pending} className="space-y-4"><legend className="mb-3 font-semibold">{t("issuer")}</legend>
      {fields.map(([name,label,type,max])=><label key={name} className="block text-sm font-medium">{t(label)}<input className={input} name={name} type={type} maxLength={max} required={name!=="iban"} max={name==="date"?today:undefined} defaultValue={String(defaults[name]??"")}/></label>)}
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">{t("vat")}<select aria-label={t("vat")} className={input} name="vatRate" value={vat} required onChange={e=>setVat(e.target.value)}><option value="">{t("taxChoice")}</option>{[0,4,10,21].map(v=><option key={v} value={v}>{v}%</option>)}</select></label>
      <label className="text-sm font-medium">{t("withholding")}<select aria-label={t("withholding")} className={input} name="withholdingRate" value={withholding} required onChange={e=>setWithholding(e.target.value)}><option value="">{t("taxChoice")}</option>{[0,7,15,19].map(v=><option key={v} value={v}>{v}%</option>)}</select></label></div>
      <label className="block text-sm font-medium">{t("taxNote")}<textarea className={input} name="taxNote" maxLength={500} rows={2} required={vat==="0"} defaultValue={previous?.taxNote??""}/></label>
      <dl className="space-y-2 rounded-lg bg-stone-100 p-4 text-sm">{[[t("rate"),eur(rate)],[t("total"),`${hours} h`],[t("subtotal"),eur(amounts.subtotal)],[t("vat"),eur(amounts.vat)],[t("withholding"),`− ${eur(amounts.withholding)}`],[t("amount"),eur(amounts.total)]].map(([label,value])=><div className="flex justify-between gap-3" key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 size-5 shrink-0 accent-[#a94f2d]" type="checkbox" name="confirmed" required/>{t("invoiceConfirm")}</label>
      <button className={button} disabled={pending||rate<=0}>{pending?t("busy"):t("sendInvoice")}</button>
    </fieldset>
    {state?.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}{state?.ok && <p role="status" className="text-sm text-green-800">{state.ok}</p>}
  </form>;
}
