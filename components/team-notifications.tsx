"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/taal-provider";

export function TeamNotifications({unread}:{unread:number}) {
  const t=useT(),router=useRouter();
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')router.refresh();};const timer=setInterval(refresh,60_000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[router]);
  return <Link href="/teamberichten" aria-label={t("Teamberichten: {n} ongelezen",{n:unread})} className="relative ml-auto rounded-lg p-2 text-muted hover:bg-accent/10 hover:text-accent"><Bell size={20}/>{unread>0&&<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 text-accent-foreground">{unread>99?'99+':unread}</span>}</Link>;
}
