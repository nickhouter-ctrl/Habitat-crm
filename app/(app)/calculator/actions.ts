"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWriteUser } from "@/lib/auth/guards";
import { calculate, calculatorSchema, money } from "@/lib/calculator";
import { loadCalculatorData } from "@/lib/calculator-data";
import { db } from "@/lib/db";
import { activities, contacts, projects, type DocumentLineItem } from "@/lib/db/schema";
import { insertNumberedDocument } from "@/lib/doc-number";
import { computeTotals } from "@/lib/documents";
import { autoTermijnen, betalingsschemaTekst, quoteClauses } from "@/lib/quote-clauses";

export async function createConfiguredQuote(_previous:{error:string},form:FormData):Promise<{error:string}> {
  const user=await requireWriteUser();
  const requestId=z.string().uuid().safeParse(form.get("requestId"));
  if(!requestId.success) return {error:"Vernieuw de pagina en herstel je lokale concept."};
  const hex=createHash("sha256").update(`${user.id}:${requestId.data}`).digest("hex");
  const documentId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  let config;
  try { config=calculatorSchema.parse(JSON.parse(String(form.get("configuration")))); }
  catch {return {error:"De invoer is onvolledig of ongeldig. Controleer de aantallen en bedragen."};}
  if(form.get("reviewed")!=="on") return {error:"Controleer eerst de kostopbouw en stelposten."};
  const contactId=z.string().uuid().safeParse(form.get("contactId"));
  const projectId=z.string().uuid().optional().safeParse(form.get("projectId")||undefined);
  if(!contactId.success||!projectId.success) return {error:"Kies een geldige klant en eventueel een project."};
  const [contact,project,data]=await Promise.all([
    db.query.contacts.findFirst({where:eq(contacts.id,contactId.data),columns:{id:true}}),
    projectId.data?db.query.projects.findFirst({where:eq(projects.id,projectId.data)}):null,
    loadCalculatorData(),
  ]);
  if(!contact || projectId.data&&!project) return {error:"Klant of project bestaat niet meer."};
  if(project?.contactId&&project.contactId!==contact.id) return {error:"Dit project hoort bij een andere klant. Controleer de koppeling."};
  const result=calculate(config,data);
  if(result.errors.length) return {error:result.errors.join(" ")};
  if(!result.lines.length) return {error:"Voeg eerst werkzaamheden of producten toe."};
  if(String(form.get("priceCheck"))!==JSON.stringify(result.lines.map(l=>[l.key,l.quantity,l.price,l.cost]))) {
    return {error:"Het prijzenboek is intussen gewijzigd. Bewaar je concept lokaal, vernieuw de pagina en herstel het concept om de nieuwe prijzen te controleren."};
  }
  const language=z.enum(["nl","en","es"]).catch("nl").parse(form.get("taal"));
  const chapters=[...new Set(result.lines.map(l=>l.chapter))];
  const schedule=autoTermijnen(language,Object.fromEntries(chapters.map(c=>[c,result.lines.filter(l=>l.chapter===c).reduce((s,l)=>s+money(l.price*l.quantity),0)])));
  const items:DocumentLineItem[]=result.lines.map(l=>({name:l.name,description:l.description,units:l.quantity,unit:l.unit,
    price:l.price,costEur:l.cost??undefined,pricingBasis:l.allowance?"catalog":"construction",taxRate:21,category:"renovatie",phase:l.chapter}));
  if(result.contingency) items.push({name:`Onvoorzien (${config.contingency}%)`,units:1,price:result.contingency,taxRate:21,category:"renovatie",phase:chapters.at(-1)});
  const totals=computeTotals(items);
  const {id}=await insertNumberedDocument("estimate",{
    id:documentId,kind:"estimate",status:"draft",title:`Offerte verbouwing${project?` — ${project.name}`:""}`,contactId:contact.id,
    projectId:project?.id??null,propertyId:project?.propertyId??null,issueDate:new Date().toISOString().slice(0,10),currency:"EUR",
    subtotalEur:totals.subtotal.toFixed(2),taxEur:totals.tax.toFixed(2),totalEur:totals.total.toFixed(2),items,
    phases:chapters.map(c=>({key:c,label:c})),requiresContract:true,
    paymentSchedule:schedule.map(s=>({label:s.label,pct:s.pct,amountEur:money(totals.subtotal*s.pct/100)})),
    notes:[quoteClauses(language),betalingsschemaTekst(language,totals.subtotal,schedule)].join("\n\n"),
  }, new Date().getFullYear(), async(tx,document)=>{
    await tx.insert(activities).values({type:"note",subject:`Calculatie ${document.docNumber}`,documentId:document.id,contactId:contact.id,authorId:user.id,
      body:`Prijsafspraak: arbeid en externe bouwmaterialen +15% opslag; catalogusproducten tegen verkoopprijs.\nCALCULATOR_V2 ${JSON.stringify(config)}`});
  });
  revalidatePath("/quotes");
  redirect(`/documents/${id}/edit`);
}
