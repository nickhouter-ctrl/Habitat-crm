"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Select, StatTile, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { formatEUR, cn } from "@/lib/utils";
import { filterWindowsDealer, latestWindowsQuotes, summarizeWindows, windowsPortalHref, windowsStatusLabel, WINDOWS_STATUS } from "@/lib/windows-financials";
import type { WindowsReport } from "@/lib/windows-report";

const fmtDate=(value:string|null)=>value?new Date(value).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric",timeZone:"Europe/Madrid"}):"Nog niet gepland";
const pct=(value:number|null)=>value==null?"—":`${(value*100).toFixed(1)}%`;
const statusTone=(status:string)=>["delivered","accepted"].includes(status)?"success":status==="cancelled"||status==="rejected"?"neutral":"accent";
type View="orders"|"quotes"|"invoices"|"dealers";

function PortalLink({path,children}:{path:string;children:React.ReactNode}) {
  return <a href={windowsPortalHref(path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">{children}<ExternalLink className="size-3 shrink-0"/></a>;
}

/** Staff-only CRM view: this component is never mounted in the public customer portal. */
export function WindowsOverview({report,scoped=false}:{report:WindowsReport;scoped?:boolean}) {
  const router=useRouter();
  const [view,setView]=useState<View>("orders");
  const [dealerId,setDealerId]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [allVersions,setAllVersions]=useState(false);
  const data=filterWindowsDealer(report,dealerId);
  const {totals:t,quotes:q}=summarizeWindows(data);
  const dealerName=(id:string|null)=>id?report.dealers.find(d=>d.id===id)?.companyName||report.dealers.find(d=>d.id===id)?.email||"Onbekende dealer":"Habitat · eigen project";
  const matches=(...values:(string|null)[])=>values.some(v=>v?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const orders=data.orders.filter(o=>matches(o.number,o.customer,o.project,dealerName(o.dealerId))&&(!status||(status==="active"?!["cancelled","delivered"].includes(o.status):status==="open"?o.open>0:o.status===status)));
  const quotes=(allVersions?data.quoteRows:latestWindowsQuotes(data.quoteRows)).filter(q=>matches(q.number,q.customer,q.project,dealerName(q.dealerId))&&(!status||q.status===status));
  const invoiceStatus=(i:WindowsReport["invoices"][number])=>i.cancelled?"cancelled":i.openGross===0?"paid":"open";
  const invoices=data.invoices.filter(i=>matches(i.number,i.orderNumber,dealerName(i.dealerId))&&(!status||invoiceStatus(i)===status));
  const dealers=data.dealers.filter(d=>matches(d.companyName,d.email,d.contactName));
  const dealerCell=(id:string|null)=><div className="text-xs text-muted">{id?<Link href={`/kozijnen/dealers/${id}`} className="text-accent hover:underline">{dealerName(id)}</Link>:dealerName(id)}</div>;
  const changeView=(next:View)=>{setView(next);setStatus("");};
  const tabs:{key:View;label:string;count:number}[]=[{key:"orders",label:"Orders",count:data.orders.length},{key:"quotes",label:"Offertes",count:latestWindowsQuotes(data.quoteRows).length},{key:"invoices",label:"Facturen",count:data.invoices.length},...(!scoped?[{key:"dealers" as const,label:"Dealers",count:data.dealers.length}]:[])];
  if(!report.configured) return <Card className="p-5 text-sm text-muted">Windows is nog niet aangesloten.</Card>;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-medium">Actueel uit Habitat One Windows</p><p className="text-xs text-muted">Prijzen en betaalstatussen uit Windows. Ververs om recente wijzigingen op te halen.</p></div>
      <Button type="button" size="sm" variant="secondary" onClick={()=>router.refresh()}><RefreshCw className="size-3.5"/>Verversen</Button>
    </div>
    {!scoped&&<label className="block max-w-sm text-xs text-muted">Overzicht voor<Select aria-label="Filter op dealer" className="mt-1" value={dealerId} onChange={e=>setDealerId(e.target.value)}><option value="">Alle dealers en eigen projecten</option><option value="own">Habitat · eigen projecten</option>{report.dealers.map(d=><option key={d.id} value={d.id}>{d.companyName||d.email}</option>)}</Select></label>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Orderwaarde" value={formatEUR(t.dealer)} hint={`${t.orders} orders · excl. btw`} tone="accent"/>
      <StatTile label="Kozijnen in orders" value={t.elements} hint={`${t.m2.toLocaleString("nl-NL")} m² · ${t.active} lopend · ${t.delivered} geleverd`}/>
      <StatTile label="Open offertes" value={formatEUR(q.openValue)} hint={`${q.open} offertes · laatste versies · excl. btw`}/>
      <StatTile label="Nog te ontvangen" value={formatEUR(t.open)} hint="Openstaande Windows-facturen · incl. btw" tone={t.open>0?"warning":"neutral"}/>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Gefactureerd" value={formatEUR(t.invoicedGross)} hint={`${formatEUR(t.invoiced)} excl. btw`}/>
      <StatTile label="Betaald" value={formatEUR(t.paidGross)} hint={`${formatEUR(t.paid)} excl. btw`} tone="success"/>
      <StatTile label="Verwachte brutowinst" value={formatEUR(t.profit)} hint={`${pct(t.markupPct)} opslag op kostprijs · excl. btw`} tone={t.profit<0?"warning":"neutral"}/>
    </div>
    <details className="rounded-xl border bg-surface px-4 py-3 text-xs text-muted"><summary className="cursor-pointer font-medium text-foreground">Wat telt mee in deze bedragen?</summary><div className="mt-3 space-y-2">
      <p>De totalen gelden voor {scoped?"dit Windows-account":dealerId?dealerName(dealerId==="own"?null:dealerId):"alle dealers en eigen projecten"}. Zoeken en statusfilters beperken alleen de lijsten hieronder. Geannuleerde orders tellen niet mee in de orderwaarde.</p>
      <p>Kostprijs van de orders: {formatEUR(t.cost)} excl. btw. Brutowinst is orderwaarde min kostprijs; dit is nog geen ontvangen winst. Bij een definitieve fabrieksofferte gebruiken we de definitieve prijs, anders de raming.</p>
      <p>Factuurtotalen betreffen alleen facturen van Habitat aan dealers of eigen klanten. Dealerfacturen aan hun eindklanten tellen hier niet mee. Geannuleerde facturen tellen niet mee; een open factuur bij een geannuleerde order blijft wel zichtbaar.</p>
      <p>Open offertes tellen eenmaal per offertenummer, op basis van de laatste versie. Eerdere versies zijn opvraagbaar. Een gekoppelde CRM-factuur is hetzelfde document en wordt niet nogmaals opgeteld.</p>
    </div></details>
    <Card className="min-w-0 overflow-hidden">
      <div className="flex overflow-x-auto border-b px-3" role="tablist" aria-label="Windows-overzicht">{tabs.map(tab=><button key={tab.key} type="button" role="tab" aria-selected={view===tab.key} aria-controls="windows-list" onClick={()=>changeView(tab.key)} className={cn("shrink-0 border-b-2 px-4 py-3 text-sm",view===tab.key?"border-accent font-medium text-accent":"border-transparent text-muted")}>{tab.label} <span className="ml-1 text-xs">{tab.count}</span></button>)}</div>
      <div className="flex flex-wrap gap-3 border-b p-4">
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted"/><Input aria-label="Zoek in Windows-overzicht" placeholder="Zoek nummer, dealer, klant of project…" className="pl-9" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        {view!=="dealers"&&<Select aria-label="Filter op status" className="w-full sm:w-48" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Alle statussen</option>
          {view==="orders"?<><option value="active">Lopende orders</option><option value="open">Met openstaand bedrag</option>{["received","forwarded","factory_review","final_quote","confirmed","production","shipped","delivered","cancelled"].map(s=><option key={s} value={s}>{WINDOWS_STATUS[s]}</option>)}</>:view==="quotes"?["draft","sent","accepted","rejected","expired"].map(s=><option key={s} value={s}>{WINDOWS_STATUS[s]}</option>):<><option value="open">Openstaand</option><option value="paid">Betaald</option><option value="cancelled">Geannuleerd</option></>}
        </Select>}
        {view==="quotes"&&<label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={allVersions} onChange={e=>setAllVersions(e.target.checked)}/>Ook eerdere versies</label>}
      </div>
      {view!=="dealers"&&<p className="px-4 pt-3 text-xs text-muted md:hidden">Veeg de tabel opzij voor alle bedragen en details.</p>}
      <div id="windows-list" role="tabpanel">
        {view==="orders"&&<Table className="min-w-[760px]"><THead><Tr><Th>Order · klant</Th><Th>Status · levering</Th><Th className="text-right">Orderwaarde<br/><span className="font-normal">excl. btw</span></Th><Th className="text-right">Openstaand<br/><span className="font-normal">incl. btw</span></Th><Th>Prijsopbouw</Th></Tr></THead><TBody>
          {orders.map(o=><Tr key={o.id}><Td><PortalLink path={`/admin/orders/${o.id}`}>{o.number}</PortalLink>{dealerCell(o.dealerId)}<p className="mt-2 text-sm">{o.customer||"Geen klantnaam"}</p><p className="text-xs text-muted">{o.project}</p><p className="mt-1 text-xs text-muted">{o.elements} kozijnen · {o.m2.toLocaleString("nl-NL")} m² · {fmtDate(o.createdAt)}</p></Td>
            <Td><Badge tone={statusTone(o.status)}>{windowsStatusLabel(o.status)}</Badge><p className="mt-2 text-xs text-muted">{fmtDate(o.plannedDelivery)}</p></Td>
            <Td className="text-right font-medium tabular-nums">{formatEUR(o.dealerPrice)}<p className="text-xs font-normal text-muted">{o.factoryFinal?"Definitief":"Raming"}</p></Td>
            <Td className="text-right tabular-nums"><span className={o.open>0?"text-warning":"text-muted"}>{o.open>0?formatEUR(o.open):"—"}</span>{o.invoiced===0&&<p className="text-xs text-muted">Nog niet gefactureerd</p>}</Td>
            <Td><details className="min-w-36 text-xs"><summary className="cursor-pointer text-accent">Bekijk opbouw</summary><dl className="mt-3 space-y-2"><div><dt className="text-muted">Fabriek</dt><dd>{formatEUR(o.factory)}</dd></div><div><dt className="text-muted">Kostprijs incl. invoer/handling</dt><dd>{formatEUR(o.cost)}</dd></div><div><dt className="text-muted">Verwachte brutowinst</dt><dd>{formatEUR(o.profit)} · {pct(o.markupPct)} opslag</dd></div><div><dt className="text-muted">Gefactureerd / betaald excl. btw</dt><dd>{formatEUR(o.invoiced)} / {formatEUR(o.paid)}</dd></div></dl></details></Td></Tr>)}
          {!orders.length&&<Tr><Td colSpan={5}>Geen orders voor deze selectie.</Td></Tr>}
        </TBody></Table>}
        {view==="quotes"&&<Table className="min-w-[760px]"><THead><Tr><Th>Offerte · klant</Th><Th>Status</Th><Th>Kozijnen</Th><Th className="text-right">Habitat-prijs excl. btw</Th></Tr></THead><TBody>{quotes.map(q=><Tr key={q.id}><Td><PortalLink path={`/admin/quotes/${q.id}`}>{q.number} · v{q.version}</PortalLink>{dealerCell(q.dealerId)}<p className="mt-2">{q.customer}</p><p className="text-xs text-muted">{q.project} · {fmtDate(q.createdAt)}</p></Td><Td><Badge tone={statusTone(q.status)}>{windowsStatusLabel(q.status)}</Badge></Td><Td>{q.elements} stuks<p className="text-xs text-muted">{q.m2.toLocaleString("nl-NL")} m²</p></Td><Td className="text-right tabular-nums">{formatEUR(q.dealerPrice)}</Td></Tr>)}{!quotes.length&&<Tr><Td colSpan={4}>Geen offertes voor deze selectie.</Td></Tr>}</TBody></Table>}
        {view==="invoices"&&<Table className="min-w-[760px]"><THead><Tr><Th>Factuur · order</Th><Th>Status</Th><Th>Vervaldatum</Th><Th className="text-right">Bedrag incl. btw</Th><Th className="text-right">Open incl. btw</Th></Tr></THead><TBody>{invoices.map(i=><Tr key={i.id}><Td>{i.crmDocumentId?<Link className="font-medium text-accent hover:underline" href={`/documents/${i.crmDocumentId}`}>{i.number}</Link>:<PortalLink path={`/admin/orders/${i.orderId}`}>{i.number}</PortalLink>}<p className="mt-1 text-xs text-muted">{i.kind==="deposit"?"Aanbetaling":i.kind==="final"?"Restantfactuur":"Volledige factuur"} · {fmtDate(i.issuedAt)}</p><PortalLink path={`/admin/orders/${i.orderId}`}>{i.orderNumber}</PortalLink>{dealerCell(i.dealerId)}{!i.crmDocumentId&&<p className="text-xs text-muted">Alleen in Windows</p>}</Td><Td><Badge tone={i.cancelled?"neutral":i.openGross>0?"warning":"success"}>{i.cancelled?"Geannuleerd":i.openGross>0?"Openstaand":"Betaald"}</Badge></Td><Td className="text-xs">{fmtDate(i.dueAt)}</Td><Td className="text-right tabular-nums">{formatEUR(i.gross)}<p className="text-xs text-muted">{formatEUR(i.net)} excl. btw</p></Td><Td className="text-right tabular-nums">{formatEUR(i.openGross)}</Td></Tr>)}{!invoices.length&&<Tr><Td colSpan={5}>Geen facturen voor deze selectie.</Td></Tr>}</TBody></Table>}
        {view==="dealers"&&<div className="grid gap-4 p-4 lg:grid-cols-2">{dealers.map(d=>{
          const summary=summarizeWindows(filterWindowsDealer(report,d.id));
          return <div key={d.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><Link className="font-semibold text-accent hover:underline" href={`/kozijnen/dealers/${d.id}`}>{d.companyName||d.email}</Link><p className="text-xs text-muted">{d.email}</p></div><Badge tone={d.status==="active"?"success":"warning"}>{d.status==="active"?"Actief":"Geblokkeerd"}</Badge></div><div className="my-4 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-muted">Orders</p>{summary.totals.orders}</div><div><p className="text-xs text-muted">Open offertes</p>{summary.quotes.open}</div><div><p className="text-xs text-muted">Orderwaarde ex. btw</p>{formatEUR(summary.totals.dealer)}</div></div><div className="flex flex-wrap gap-4 text-xs">{d.contactId?<Link className="text-accent hover:underline" href={`/contacts/${d.contactId}?tab=kozijnen`}>CRM-klantdossier</Link>:<span className="text-warning">Geen gekoppeld CRM-contact</span>}<PortalLink path={`/admin/dealers/${d.id}`}>Windows-dashboard</PortalLink></div></div>;
        })}{!dealers.length&&<p className="text-sm text-muted">Geen dealers voor deze selectie.</p>}</div>}
      </div>
    </Card>
  </div>;
}
