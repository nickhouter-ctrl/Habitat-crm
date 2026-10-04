"use client";
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useT } from './taal-provider';

/** Native dialog provides focus trapping, Escape and an inert background. */
export function WorkflowModal({title,closeHref,children}:{title:string;closeHref:string;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),router=useRouter(),t=useT();
 useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();return()=>dialog?.close();},[]);
 const close=()=>{ref.current?.close();router.replace(closeHref,{scroll:false});};
 return <dialog ref={ref} aria-label={title} onCancel={e=>{e.preventDefault();close();}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-surface px-5 py-4"><h2 className="font-semibold">{title}</h2><button type="button" onClick={close} aria-label={t("Sluiten")} className="rounded-lg p-2 text-muted hover:bg-background"><X size={18}/></button></div><div className="p-5">{children}</div></dialog>;
}
