"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bath, Check, ChevronDown, FileImage, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button, Card, CardContent, Field, Input, Select } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { BATH_SLOTS, COLOR_NAMES, OLD_BATHROOM_PRODUCTS, bathroomCandidates, calculate, calculatorSchema, catalogCandidates, catalogConsumables, CATALOG_POSTS,
  emptyConfig, newBathroom, postQuantity, pricePost, representative, wallArea, type CalcData, type CalculatorConfig, type BathroomConfig } from "@/lib/calculator";
import { formatEUR } from "@/lib/utils";
import { createConfiguredQuote } from "@/app/(app)/calculator/actions";
import { autoTermijnen } from "@/lib/quote-clauses";
import { DRIVERS, DRIVER_GROEP_LABEL } from "@/lib/price-book";
import { applyPlanMeasurements, MAX_PLAN_BYTES, planSchema, type PlanRead } from "@/lib/plan-measurements";

const MEASURES=[...DRIVERS.filter(d=>d.groep!=="sanitair"&&!d.afgeleid&&d.key!=="woonoppervlak_m2"),
  {key:"sloop_vloer_m2",label:"Vloer slopen (buiten badkamers)",groep:"wanden" as const,eenheid:"m²"},
  {key:"schilder_binnen_m2",label:"Schilderwerk binnen",groep:"wanden" as const,eenheid:"m²"},
  {key:"schilder_buiten_m2",label:"Schilderwerk buiten",groep:"wanden" as const,eenheid:"m²"},
  {key:"bekabeling_m2",label:"Hoofdbekabeling vernieuwen",groep:"techniek" as const,eenheid:"m²"},
  {key:"dekvloer_m2",label:"Dekvloer",groep:"oppervlaktes" as const,eenheid:"m²"},
  {key:"irrigatie_m2",label:"Irrigatie tuin",groep:"buiten" as const,eenheid:"m²"},
];

type Option={id:string;name:string};
function subscribeDraft(onChange:()=>void){window.addEventListener("storage",onChange);window.addEventListener("calculator-draft",onChange);return()=>{window.removeEventListener("storage",onChange);window.removeEventListener("calculator-draft",onChange);};}
function NumberField({label,value,onChange,step="0.01",hint}:{label:string;value:number;onChange:(v:number)=>void;step?:string;hint?:string}) {
  return <label className="block text-xs text-muted"><span className="mb-1 block">{label}</span><Input aria-label={label} type="number" min="0" step={step} value={value||""} placeholder="0" onChange={e=>onChange(Math.max(0,Number(e.target.value)||0))}/>{hint&&<span className="mt-1 block text-[11px]">{hint}</span>}</label>;
}
export function QuoteConfigurator({data,contacts,projects,userId,initial}:{data:CalcData;contacts:Option[];projects:Option[];userId:string;initial?:CalculatorConfig}) {
  const uiT = useUiTranslation();
  const [requestId]=useState(()=>crypto.randomUUID());
  const [config,setConfig]=useState<CalculatorConfig>(initial??emptyConfig);
  const [contact,setContact]=useState("");const [project,setProject]=useState("");
  const [language,setLanguage]=useState<"nl"|"en"|"es">("nl");
  const [saved,setSaved]=useState(false);
  const [reviewed,setReviewed]=useState(false);
  const [planFile,setPlanFile]=useState<File|null>(null);
  const [planReference,setPlanReference]=useState("");
  const [planRead,setPlanRead]=useState<PlanRead|null>(null);
  const [planBusy,setPlanBusy]=useState(false);
  const [planError,setPlanError]=useState("");
  const [planConfirmed,setPlanConfirmed]=useState(false);
  const [planFloorConfirmed,setPlanFloorConfirmed]=useState(false);
  const [state,action,pending]=useActionState(createConfiguredQuote,{error:""});
  const storageKey=`habitat-calculator-v2-${userId}`;
  const result=useMemo(()=>calculate(config,data),[config,data]);
  const chapters=[...new Set(data.posts.map(p=>p.chapter))];
  const update=(next:CalculatorConfig)=>{setConfig(next);setSaved(false);setReviewed(false);};
  const patch=(p:Partial<CalculatorConfig>)=>update({...config,...p});
  const patchBath=(i:number,p:Partial<BathroomConfig>)=>patch({bathrooms:config.bathrooms.map((b,n)=>n===i?{...b,...p}:b)});
  const restorable=useSyncExternalStore(subscribeDraft,()=>{try{return !!localStorage.getItem(storageKey);}catch{return false;}},()=>false);
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(!saved&&(result.lines.length||config.bathrooms.length)){e.preventDefault();}};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[saved,result.lines.length,config.bathrooms.length]);
  function saveDraft(){try{localStorage.setItem(storageKey,JSON.stringify({config,contact,project,language}));setSaved(true);window.dispatchEvent(new Event("calculator-draft"));}catch{setSaved(false);}}
  function restore(){try{const draft=JSON.parse(localStorage.getItem(storageKey)??"{}");const parsed=calculatorSchema.safeParse(draft.config);if(parsed.success){setConfig(parsed.data);setContact(draft.contact??"");setProject(draft.project??"");setLanguage(["nl","en","es"].includes(draft.language)?draft.language:"nl");setSaved(true);setReviewed(false);}}catch{}}
  async function extractPlan(){
    if(!planFile||planBusy)return;
    if(planFile.size>MAX_PLAN_BYTES){setPlanError(uiT("Bestand te groot. Gebruik maximaal 3,8 MB per tekening of foto."));return;}
    setPlanFloorConfirmed(false);setPlanConfirmed(false);
    setPlanBusy(true);setPlanError("");setPlanRead(null);
    try{
      const body=new FormData();body.set("file",planFile);body.set("reference",planReference);
      const response=await fetch("/api/calculator/read-plan",{method:"POST",body});
      const payload=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(payload?.error?uiT(payload.error):uiT("De tekening kon niet worden uitgelezen."));
      const parsed=planSchema.safeParse(payload);
      if(!parsed.success)throw new Error(uiT("De tekening kon niet worden uitgelezen."));
      setPlanRead(parsed.data);setPlanConfirmed(false);
    }catch(error){setPlanError(error instanceof Error?error.message:uiT("De tekening kon niet worden uitgelezen."));}
    finally{setPlanBusy(false);}
  }
  function applyPlan(){
    if(!planRead||!planConfirmed)return;
    try{
      const next=applyPlanMeasurements(config,planRead,planFloorConfirmed);
      if(planRead.rooms.some(room=>room.type==="bathroom")&&config.bathrooms.length&&!window.confirm(uiT("De herkende badkamers vervangen de badkamers die je al hebt ingevuld. Doorgaan?")))return;
      update(next);setPlanRead(null);setPlanError("");
    }catch(error){setPlanError(error instanceof Error?uiT(error.message):uiT("De tekening kon niet worden uitgelezen."));}
  }
  const schedule=autoTermijnen(language,Object.fromEntries(chapters.map(c=>[c,result.lines.filter(l=>l.chapter===c).reduce((s,l)=>s+l.price*l.quantity,0)])));
  return <form action={action} className="space-y-5">
    <input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="configuration" value={JSON.stringify(config)}/><input type="hidden" name="contactId" value={contact}/><input type="hidden" name="projectId" value={project}/><input type="hidden" name="taal" value={language}/>
    <input type="hidden" name="priceCheck" value={JSON.stringify(result.lines.map(l=>[l.key,l.quantity,l.price,l.cost]))}/>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface p-4">
      <div><p className="font-medium">{uiT("Van werkzaamheden naar een complete offerte")}</p><p className="mt-1 text-xs text-muted">{uiT("Arbeid en bouwmateriaal +15% opslag · eigen assortiment tegen verkoopprijs · bedragen excl. btw")}</p></div>
      <div className="flex gap-2">{restorable&&<Button type="button" variant="ghost" size="sm" onClick={restore}><RotateCcw className="size-4"/>{uiT("Concept herstellen")}</Button>}<Button type="button" variant="secondary" size="sm" onClick={saveDraft}>{saved?<Check className="size-4"/>:null}{saved?uiT("Lokaal bewaard"):uiT("Concept lokaal bewaren")}</Button></div>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Card><CardContent><div className="grid gap-4 sm:grid-cols-3">
          <Field label={uiT("Klant")}><Combobox key={`contact-${contact}`} options={contacts.map(c=>({value:c.id,label:c.name}))} defaultValue={contact} placeholder={uiT("Kies een klant")} onSelect={setContact}/></Field>
          <Field label={uiT("Project (optioneel)")}><Combobox key={`project-${project}`} options={projects.map(p=>({value:p.id,label:p.name}))} defaultValue={project} clearable placeholder={uiT("Kies een project")} onSelect={setProject}/></Field>
          <Field label={uiT("Offertetaal")}><Select value={language} onChange={e=>setLanguage(e.target.value as typeof language)}><option value="nl">Nederlands</option><option value="en">{uiT("Engels")}</option><option value="es">{uiT("Spaans")}</option></Select></Field>
        </div></CardContent></Card>
        <Card><CardContent className="space-y-4">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-accent/10 p-2.5 text-accent"><FileImage className="size-5"/></span><div><h2 className="font-semibold">{uiT("Tekeningen en maten")}</h2><p className="mt-1 text-xs text-muted">{uiT("Upload een maatvaste tekening of een foto. AI stelt ruimten en maten voor; je controleert alles voordat het in de calculatie komt.")}</p></div></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs text-muted">{uiT("Bouwtekening of foto (PDF, JPG, PNG, WebP · max. 3,8 MB)")}<Input className="mt-1" type="file" disabled={planBusy} accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={event=>{setPlanFile(event.target.files?.[0]??null);setPlanRead(null);setPlanError("");setPlanConfirmed(false);}}/></label>
            <label className="block text-xs text-muted">{uiT("Referentiemaat of schaal (optioneel)")}<Input className="mt-1" value={planReference} maxLength={240} disabled={planBusy} onChange={event=>{setPlanReference(event.target.value);setPlanRead(null);setPlanConfirmed(false);setPlanFloorConfirmed(false);}} placeholder={uiT("Bijv. schaal 1:50 of deurbreedte 90 cm")}/></label>
            <Button type="button" variant="secondary" disabled={!planFile||planBusy} onClick={extractPlan}>{planBusy?<span className="animate-pulse">{uiT("Tekening lezen…")}</span>:<><Upload className="size-4"/>{uiT("Maten voorstellen")}</>}</Button>
          </div>
          {planError&&<p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{planError}</p>}
          {planRead&&<div className="space-y-3 rounded-xl border bg-background/50 p-4">
            <div><p className="font-medium">{uiT("Voorstel uit tekening — nog niet toegepast")}</p><p className="text-xs text-muted">{planRead.scale?`${uiT("Schaal")}: ${planRead.scale} · `:""}{planRead.unit==="unknown"?uiT("Eenheid niet herkend"):uiT("Maten omgezet naar meter")}</p></div>
            {planRead.notes.map((note,index)=><p key={index} className="text-xs text-warning">{note}</p>)}
            {planRead.rooms.length===0?<p className="text-sm text-muted">{uiT("Geen ruimten met voldoende maatvoering gevonden. Vul de maten hieronder handmatig in.")}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-muted"><tr><th className="py-2">{uiT("Ruimte")}</th><th>{uiT("Vloer m²")}</th><th>{uiT("Omtrek m")}</th><th>{uiT("Hoogte m")}</th><th>{uiT("Openingen m²")}</th><th>{uiT("Wand m²")}</th><th>{uiT("Badkamer")}</th><th>{uiT("Betrouwbaarheid")}</th></tr></thead><tbody>{planRead.rooms.map((room,index)=><tr key={`${room.name}-${index}`} className="border-t"><td className="py-2 pr-2">{room.name}</td><td>{room.floorM2??"—"}</td><td>{room.perimeterM??"—"}</td><td>{room.wallHeightM??"—"}</td><td>{room.openingsM2??"—"}</td><td>{room.perimeterM!=null&&room.wallHeightM!=null&&room.openingsM2!=null?Math.max(0,room.perimeterM*room.wallHeightM-room.openingsM2).toFixed(2):"—"}</td><td>{room.type==="bathroom"?[room.showers!=null?`${room.showers} ${uiT("douches")}`:"",room.baths!=null?`${room.baths} ${uiT("baden")}`:"",room.toilets!=null?`${room.toilets} ${uiT("toiletten")}`:"",room.basins!=null?`${room.basins} ${uiT("wasbakken")}`:""].filter(Boolean).join(" · "):"—"}</td><td>{uiT(room.confidence==="high"?"Hoge betrouwbaarheid":room.confidence==="medium"?"Gemiddelde betrouwbaarheid":"Lage betrouwbaarheid")}<span className="block text-muted">{room.evidence}</span></td></tr>)}</tbody></table></div>}
            <p className="text-xs text-muted">{uiT("De herkende wandoppervlakte is omtrek × hoogte − openingen. Onbekende maten blijven leeg; ongedimensioneerde tekeningen kunnen geen betrouwbare m² opleveren.")}</p>
            {planRead.rooms.length>0&&<><p className="text-xs text-muted">{uiT("Wand- of vloertegels worden bij ontbrekende maten niet ingeschakeld. Vul de maten aan en schakel het tegelwerk daarna zelf in.")}</p>{planRead.rooms.every(room=>room.floorM2!=null)&&<label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5" checked={planFloorConfirmed} onChange={event=>setPlanFloorConfirmed(event.target.checked)}/>{uiT("Deze tekening bevat alle ruimten van de woning. Neem de som over als totaal woonoppervlak.")}</label>}<p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">{uiT("Ontbrekende maten of aantallen worden als 0 overgenomen. Vul die zelf aan voordat je de offerte maakt.")}</p><label className="flex items-start gap-2 text-xs text-muted"><input className="mt-0.5" type="checkbox" checked={planConfirmed} onChange={event=>setPlanConfirmed(event.target.checked)}/>{uiT("Ik heb de voorstellen met de tekening vergeleken en vul ontbrekende gegevens aan.")}</label><Button type="button" variant="secondary" disabled={!planConfirmed} onClick={applyPlan}>{uiT("Badkamers en woonoppervlak overnemen")}</Button></>}
          </div>}
          <p className="text-xs text-muted">{uiT("Je kunt maten ook zonder tekening invoeren in de velden hieronder. De tekening zelf wordt niet opgeslagen in het dossier.")}</p>
        </CardContent></Card>
        <Card><CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-accent/10 p-2.5 text-accent"><Bath className="size-5"/></span><div><h2 className="font-semibold">{uiT("Badkamers samenstellen")}</h2><p className="text-xs text-muted">{uiT("Complete stelposten met Brauer, per kleur en uitvoering.")}</p></div></div>
            <Button type="button" variant="secondary" size="sm" disabled={config.bathrooms.length>=12} onClick={()=>patch({bathrooms:[...config.bathrooms,newBathroom()]})}><Plus className="size-4"/>{uiT("Badkamer toevoegen")}</Button></div>
          <div className="flex flex-wrap items-end gap-4"><div className="w-32"><NumberField label={uiT("Aantal badkamers")} value={config.bathrooms.length} step="1" onChange={n=>patch({bathrooms:Array.from({length:Math.min(12,Math.floor(n))},(_,i)=>config.bathrooms[i]??newBathroom())})}/></div>
            <label className="min-w-52 text-xs text-muted">{uiT("Kleur voor alle badkamers")}<Select className="mt-1" value={config.color} onChange={e=>{
              const overrides=config.bathrooms.some(b=>b.color||Object.keys(b.choices).length||Object.keys(b.slotColors).length);
              const replace=overrides&&window.confirm(uiT("Ook de afzonderlijke kleur- en productkeuzes terugzetten naar de nieuwe algemene kleur? Annuleren behoudt de afwijkingen."));
              patch({color:e.target.value,...(replace?{bathrooms:config.bathrooms.map(b=>({...b,color:"",choices:{},slotColors:{}}))}:{})});
            }}>{Object.entries(COLOR_NAMES).map(([key,label])=><option key={key} value={key}>{uiT(label)}</option>)}</Select></label>
          </div>
          {config.bathrooms.map((b,i)=><div key={i} className="rounded-xl border bg-background/40 p-4">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{uiT("Badkamer")} {i+1}</h3><button type="button" aria-label={uiT("Badkamer {v0} verwijderen", { v0: i+1 })} className="rounded-md p-2 text-muted hover:text-danger" onClick={()=>patch({bathrooms:config.bathrooms.filter((_,n)=>n!==i)})}><Trash2 className="size-4"/></button></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberField label={uiT("Badkamer {v0}: m² vloer", { v0: i+1 })} value={b.m2} onChange={m2=>patchBath(i,{m2})}/>
              <NumberField label={uiT("Douches")} value={b.showers} step="1" onChange={showers=>patchBath(i,{showers:Math.min(10,Math.floor(showers))})}/>
              <NumberField label={uiT("Vrijstaande baden")} value={b.baths} step="1" onChange={baths=>patchBath(i,{baths:Math.min(10,Math.floor(baths))})}/>
              <NumberField label={uiT("Toiletten")} value={b.toilets} step="1" onChange={toilets=>patchBath(i,{toilets:Math.min(10,Math.floor(toilets))})}/>
              <label className="text-xs text-muted">{uiT("Wasbakken")}<Select className="mt-1" value={b.basins} onChange={e=>{const basins=Number(e.target.value) as 0|1|2;patchBath(i,{basins,width:basins===2?120:60,choices:{}});}}><option value="0">{uiT("Geen meubel")}</option><option value="1">{uiT("1 wasbak · 60 cm")}</option><option value="2">{uiT("2 wasbakken · 120 cm")}</option></Select></label>
              <NumberField label={uiT("Breedte meubel en spiegel (cm)")} value={b.width} step="10" onChange={width=>patchBath(i,{width,choices:{}})}/>
            </div>
            <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-accent">{uiT("Maten, werkzaamheden en producten aanpassen")}</summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><NumberField label={uiT("Omtrek wanden (m)")} value={b.perimeter} onChange={perimeter=>patchBath(i,{perimeter})} hint={uiT("Leeg: schatting vierkante ruimte")}/><NumberField label={uiT("Tegelhoogte (m)")} value={b.height} onChange={height=>patchBath(i,{height})}/><NumberField label={uiT("Deuren/ramen aftrek (m²)")} value={b.openings} onChange={openings=>patchBath(i,{openings})}/></div>
              <p className="mt-2 text-xs text-muted">{uiT("Netto wandtegels:")} {wallArea(b)} {uiT("m². Materiaalverlies staat apart in de prijsopbouw.")}</p>
              <div className="my-3 flex flex-wrap gap-4 text-sm">{([['demolish','Bestaande badkamer strippen'],['floorTiles','Vloer betegelen'],['wallTiles','Wanden betegelen']] as const).map(([key,label])=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={b[key]} onChange={e=>patchBath(i,{[key]:e.target.checked})}/>{uiT(label)}</label>)}</div>
              <label className="mb-3 block text-xs text-muted">{uiT("Badkamermeubel")}<Select className="mt-1" value={b.furniture} onChange={e=>patchBath(i,{furniture:e.target.value as "stock"|"separate",choices:{}})}><option value="stock">{uiT("Core A1 / A2 voorraadset (kast + wastafel)")}</option><option value="separate">{uiT("Losse onderkast en wastafelblad")}</option></Select></label>
              <label className="block text-xs text-muted">{uiT("Kleur van deze badkamer")}<Select className="mt-1" value={b.color} onChange={e=>patchBath(i,{color:e.target.value,choices:{}})}><option value="">{uiT("Algemene kleur volgen")}</option>{Object.entries(COLOR_NAMES).map(([key,label])=><option key={key} value={key}>{uiT(label)}</option>)}</Select></label>
              <div className="mt-4 space-y-3">{BATH_SLOTS.filter(s=>s.count(b)>0 && !(s.key==="basin"&&b.furniture==="stock")).map(slot=>{
                const candidates=bathroomCandidates(data.products,slot.key,b,b.slotColors[slot.key]||b.color||config.color);
                const standard=representative(candidates);
                return <div key={slot.key}><label className="block text-xs text-muted">{slot.count(b)}{uiT("×")} {slot.key==="cabinet"&&b.furniture==="stock"?uiT("Complete Core-meubelset"):uiT(slot.label)}<Select className="mt-1" value={b.choices[slot.key]??""} onChange={e=>patchBath(i,{choices:{...b.choices,[slot.key]:e.target.value}})}><option value="">{standard?uiT("Standaard: {v0} · {v1} · {v2}", { v0: standard.name, v1: standard.label, v2: formatEUR(standard.price) }):uiT("Geen passende uitvoering — controle nodig")}</option>{candidates.map(p=><option key={p.id} value={p.id}>{p.name} · {p.label} · {p.code} · {formatEUR(p.price)}</option>)}</Select></label>{slot.colored&&<label className="mt-1 flex items-center gap-2 text-[11px] text-muted">{uiT("Afwijkende kleur")}<Select className="w-auto py-1 text-xs" value={b.slotColors[slot.key]??""} onChange={e=>{const choices={...b.choices};delete choices[slot.key];patchBath(i,{slotColors:{...b.slotColors,[slot.key]:e.target.value},choices});}}><option value="">{uiT("Badkamerkleur volgen")}</option>{Object.entries(COLOR_NAMES).map(([key,label])=><option key={key} value={key}>{uiT(label)}</option>)}</Select></label>}</div>;
              })}</div>
            </details>
            <div className="mt-4 flex justify-between border-t pt-3 text-sm"><span className="text-muted">{uiT("Sanitair stelpost · montage onder werkzaamheden")}</span><strong>{formatEUR(result.lines.filter(l=>l.key.startsWith(`bath-${i}-`)).reduce((s,l)=>s+l.price*l.quantity,0))}</strong></div>
          </div>)}
        </CardContent></Card>
        <Card><CardContent className="space-y-3"><h2 className="font-semibold">{uiT("Maten en aantallen van het overige werk")}</h2><p className="text-xs text-muted">{uiT("Alleen invullen wat moet gebeuren. Tegelvloeren hier zijn buiten de badkamers. Stucwerk en schilderwerk kies je afzonderlijk.")}</p>
          {[...new Set(MEASURES.map(d=>d.groep))].map(group=><details key={group} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{uiT(DRIVER_GROEP_LABEL[group])}</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">{MEASURES.filter(d=>d.groep===group).map(d=><NumberField key={d.key} label={`${d.key==="kelder_m3"?uiT("Graafwerk / kelder"):uiT(d.label)} (${d.eenheid})`} value={config.dimensions[d.key]??0} onChange={n=>patch({dimensions:{...config.dimensions,[d.key]:n}})} hint={d.key.includes("zwembad")?uiT("Wateroppervlak: lengte × breedte. Inclusies controleren bij prijsopbouw."):d.key==="kelder_m3"?uiT("Lengte × breedte × diepte; controleer grondsoort en afvoer."):undefined}/>)}</div></details>)}
        </CardContent></Card>
        <div><h2 className="text-lg font-semibold">{uiT("Werkzaamheden en prijsopbouw")}</h2><p className="mt-1 text-sm text-muted">{uiT("Voorgestelde aantallen blijven aanpasbaar. Open een hoofdstuk voor de inbegrepen werkzaamheden, eenheidsprijzen en kostopbouw.")}</p></div>
        {chapters.map(chapter=>{
          const posts=data.posts.filter(p=>p.chapter===chapter&&!OLD_BATHROOM_PRODUCTS.includes(p.name));
          const chapterTotal=result.lines.filter(l=>l.chapter===chapter).reduce((s,l)=>s+l.price*l.quantity,0);
          return <details key={chapter} className="rounded-xl border bg-surface" open={undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4"><span className="flex items-center gap-2 font-medium"><ChevronDown className="size-4 text-muted"/>{chapter}</span><span className="text-sm tabular-nums text-accent">{chapterTotal?formatEUR(chapterTotal):uiT("Werk toevoegen")}</span></summary>
            <div className="space-y-4 border-t p-4">{posts.map(p=>{
              const qty=postQuantity(p,config);const priced=pricePost(p,1,config,data.products);
              const override=config.costOverrides[p.id]; const candidates=catalogCandidates(data.products,p);
              return <div key={p.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{p.name==="Kelder uitgraven"?uiT("Graafwerk / kelder uitgraven"):p.name}</p><p className="mt-1 text-xs text-muted">{priced?`${formatEUR(priced.price)} / ${p.unit}`:uiT("Kostopbouw of productkeuze nodig")}{p.waste?uiT(" · {v0}% materiaalverlies", { v0: p.waste }):""}</p></div><div className="w-28"><NumberField label={uiT("Aantal {v0} ({v1})", { v0: p.name, v1: p.unit })} value={qty} onChange={n=>patch({quantities:{...config.quantities,[p.id]:n}})}/></div></div>
                {p.review&&<p className="mt-2 text-xs text-warning">{uiT("Kostprijs / normuren nog te controleren")}</p>}
                <details className="mt-2"><summary className="cursor-pointer text-xs text-accent">{uiT("Opbouw en aannames bekijken")}</summary>
                  <p className="my-2 text-xs text-muted">{p.description}</p>
                  <div className="grid gap-3 sm:grid-cols-2"><NumberField label={uiT("Arbeidsuren per {v0}", { v0: p.unit })} value={override?.hours??p.hours??0} onChange={hours=>patch({costOverrides:{...config.costOverrides,[p.id]:{hours,material:override?.material??((p.name in CATALOG_POSTS||p.productId)?catalogConsumables(p):p.material??0)}}})}/>
                  <NumberField label={uiT("{v0} per {v1} (€)", { v0: (p.name in CATALOG_POSTS||p.productId)?uiT("Montageverbruik (excl. catalogusproduct)"):uiT("Materiaal / externe kosten"), v1: p.unit })} value={override?.material??((p.name in CATALOG_POSTS||p.productId)?catalogConsumables(p):p.material??p.cost??0)} onChange={material=>patch({costOverrides:{...config.costOverrides,[p.id]:{hours:override?.hours??p.hours??0,material}}})}/></div>
                  {(p.name in CATALOG_POSTS||p.productId)&&<label className="mt-3 block text-xs text-muted">{uiT("Catalogusproduct")}<Select value={config.productChoices[p.id]??""} onChange={e=>patch({productChoices:{...config.productChoices,[p.id]:e.target.value}})}><option value="">{uiT("Passende standaard uit catalogus")}</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {formatEUR(c.price)} / {c.unit}</option>)}</Select></label>}
                  {priced&&<p className="mt-3 text-xs text-muted">{uiT("Kostprijs")} {priced.cost==null?uiT("onbekend"):formatEUR(priced.cost)} {uiT("· verkoop")} {formatEUR(priced.price)} {uiT("per")} {p.unit}{uiT(". Arbeid over netto aantal; snijverlies alleen over materiaal.")}</p>}
                  <button type="button" className="mt-2 text-xs text-accent underline" onClick={()=>{const quantities={...config.quantities};const costOverrides={...config.costOverrides};delete quantities[p.id];delete costOverrides[p.id];patch({quantities,costOverrides});}}>{uiT("Terug naar voorgestelde hoeveelheid en kostopbouw")}</button>
                </details>
              </div>;
            })}</div>
          </details>;
        })}
      </div>
      <aside className="space-y-4 xl:sticky xl:top-20">
        <Card><CardContent className="space-y-4"><h2 className="font-semibold">{uiT("Jouw calculatie")}</h2>
          <div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted">{uiT("Werk + producten")}</span><span>{formatEUR(result.subtotal)}</span></div><div className="flex justify-between"><span className="text-muted">{uiT("Geraamde kostprijs")}{result.unknownCost?uiT(" (onvolledig)"):""}</span><span>{formatEUR(result.cost)}</span></div><div className="flex justify-between"><span className="text-muted">{uiT("Brutowinst vóór overhead")}</span><span>{result.earnings==null?uiT("Niet volledig bekend"):formatEUR(result.earnings)}</span></div><div className="flex justify-between"><span className="text-muted">{uiT("Brutomarge op verkoop")}</span><span>{result.earnings==null||result.subtotal<=0?"—":`${((result.earnings/result.subtotal)*100).toFixed(1)}%`}</span></div><div className="flex justify-between"><span className="text-muted">{uiT("Geraamde arbeid")}</span><span>{result.hours} {uiT("uur")}</span></div></div>
          <p className="text-xs text-muted">{uiT("Brutomarge = brutowinst ÷ verkoopbedrag excl. btw. Algemene bedrijfskosten zijn niet afgetrokken.")}</p>
          <div className="grid grid-cols-2 gap-3 border-t pt-3"><NumberField label={uiT("Kosttarief arbeid €/uur")} value={config.hourlyRate} onChange={hourlyRate=>patch({hourlyRate:Math.min(250,hourlyRate)})}/><NumberField label={uiT("Onvoorzien % (bewust kiezen)")} value={config.contingency} onChange={contingency=>patch({contingency:Math.min(30,contingency)})}/></div>
          {config.contingency>0&&<p className="text-xs text-muted">{uiT("Onvoorzien:")} {formatEUR(result.contingency)} {uiT("over werk en producten, als aparte offerteregel.")}</p>}
          <div className="rounded-lg bg-accent/10 p-4"><p className="text-xs text-muted">{uiT("Offertetotaal excl. btw")}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-accent" aria-live="polite">{formatEUR(result.total)}</p><p className="mt-1 text-xs text-muted">{formatEUR(result.total*1.21)} {uiT("incl. 21% btw")}</p></div>
          <p className="text-xs text-muted">{uiT("Brauer wordt bij de leverancier besteld. De gekozen standaardproducten onderbouwen de stelposten; definitieve keuzes worden verrekend.")}</p>
          {result.warnings.map(w=><p key={w} className="text-xs text-warning">{w}</p>)}
          {result.errors.length>0&&<div role="alert" className="space-y-1 rounded-lg bg-danger/10 p-3 text-xs text-danger">{result.errors.map(e=><p key={e}>{e}</p>)}</div>}
          <label className="flex items-start gap-2 text-xs text-muted"><input className="mt-0.5" type="checkbox" name="reviewed" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>{uiT("Ik heb hoeveelheden, kostprijzen, inbegrepen werkzaamheden en stelposten gecontroleerd.")}</label>
          {state.error&&<p role="alert" className="text-sm text-danger">{uiT(state.error ?? "")}</p>}
          <SubmitButton className="w-full" pendingLabel={uiT("Concept aanmaken…")} disabled={pending||!contact||!reviewed||!!result.errors.length||!result.lines.length}>{uiT("Conceptofferte aanmaken")}</SubmitButton>
          <p className="text-xs text-muted">{uiT("Je controleert de conceptofferte vóór verzending. Er wordt geen mail verstuurd.")}</p>
        </CardContent></Card>
        {!!schedule.length&&<Card><CardContent><h3 className="mb-3 text-sm font-semibold">{uiT("Voorgesteld betalingsschema")}</h3><div className="space-y-2 text-xs">{schedule.map((s,i)=><div key={i} className="flex justify-between gap-3"><span className="text-muted">{uiT(s.label)}</span><span className="whitespace-nowrap">{s.pct}% · {formatEUR(result.total*s.pct/100)}</span></div>)}</div><p className="mt-3 text-xs text-muted">{uiT("Op de conceptofferte verder aanpasbaar. Laat termijnen vóór de bijbehorende inkoop en uitvoering vallen.")}</p></CardContent></Card>}
      </aside>
    </div>
  </form>;
}
