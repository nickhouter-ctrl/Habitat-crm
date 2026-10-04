"use client";
import { useState } from 'react';
import { useT } from '@/components/taal-provider';
export function AgendaDetailTabs({day,overdue,undated,counts}:{day:React.ReactNode;overdue:React.ReactNode;undated:React.ReactNode;counts:{day:number;overdue:number;undated:number}}){
 const [selected,setSelected]=useState<'day'|'overdue'|'undated'>('day'),t=useT();
 return <section id="dagdetails" className="mt-5 scroll-mt-20"><div role="tablist" aria-label={t("Agendaoverzicht")} className="mb-4 flex gap-1 overflow-x-auto border-b">{(['day','overdue','undated'] as const).map(key=><button key={key} id={`agenda-tab-${key}`} role="tab" aria-selected={selected===key} aria-controls={`agenda-panel-${key}`} onClick={()=>setSelected(key)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${selected===key?'border-accent text-accent':'border-transparent text-muted hover:text-foreground'}`}>{t(key==='day'?"Dagplanning":key==='overdue'?"Achterstallig":"Zonder datum")} <span className={`ml-2 rounded-full px-1.5 text-xs ${key==='overdue'&&counts[key]>0?'bg-danger/10 text-danger':'bg-background text-muted'}`}>{counts[key]}</span></button>)}</div>{(['day','overdue','undated'] as const).map(key=><div key={key} id={`agenda-panel-${key}`} role="tabpanel" aria-labelledby={`agenda-tab-${key}`} hidden={selected!==key}>{key==='day'?day:key==='overdue'?overdue:undated}</div>)}</section>;
}
