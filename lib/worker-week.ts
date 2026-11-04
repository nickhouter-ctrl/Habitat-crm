import { z } from "zod";

export type WeekLang = "nl" | "es" | "en";
export const weekLang = (value: unknown): WeekLang => value === "nl" || value === "en" ? value : "es";
export function madridToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`); return addDays(date, -((d.getUTCDay() + 6) % 7));
}
export function isoWeek(date: string) {
  const d = new Date(`${mondayOf(date)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 3);
  const year = d.getUTCFullYear();
  return { year, week: 1 + Math.round((Date.parse(`${mondayOf(date)}T12:00:00Z`) - Date.parse(`${mondayOf(`${year}-01-04`)}T12:00:00Z`)) / 604800000) };
}
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s);
const crewSchema = z.object({
  people: z.number().int().min(1).max(30), names: z.string().trim().max(1500),
  hours: z.number().min(0).max(16), description: z.string().trim().max(2000), zone: z.string().trim().max(200),
});
export const weekDaysSchema = z.array(z.object({ date: dateSchema, state: z.enum(["empty", "work", "off"]), crews: z.array(crewSchema).max(12), note: z.string().trim().max(500) })).length(7);
export type WeekDay = z.infer<typeof weekDaysSchema>[number];
export type WeekCrew = z.infer<typeof crewSchema>;
export const crewNames = (s: string) => s.split(/[\n;,]/).map(n => n.trim()).filter(Boolean);
export const totalWeekHours = (days: WeekDay[]) => Math.round(days.reduce((sum,d)=>sum+(d.state === "work" ? d.crews.reduce((s,c)=>s+c.people*c.hours,0):0),0)*100)/100;
export function emptyWeek(monday: string): WeekDay[] { return Array.from({length:7},(_,i)=>({date:addDays(monday,i),state:"empty",crews:[],note:""})); }
export function validateWeek(raw: unknown, monday: string, today: string, submit: boolean): { days?: WeekDay[]; error?: string } {
  if (!dateSchema.safeParse(monday).success || mondayOf(monday)!==monday || monday>today || monday<addDays(mondayOf(today),-56)) return {error:"week"};
  const result=weekDaysSchema.safeParse(raw);if(!result.success)return {error:"fields"};
  const days=result.data;
  for(let i=0;i<7;i++) {
    const d=days[i];if(d.date!==addDays(monday,i))return {error:"week"};
    if(d.date>today && d.state==="work")return {error:"future"};
    if(d.state!=="work" && d.crews.length)return {error:"fields"};
    if(!submit)continue;
    if(d.state==="empty")return {error:"missingDay"};
    if(d.state!=="work")continue;
    if(!d.crews.length)return {error:"fields"};
    const people=new Map<string,number>();
    for(const c of d.crews) {
      if(c.hours<=0 || Math.round(c.hours*4)!==c.hours*4)return {error:"hours"};
      if(c.description.length<10)return {error:"description"};
      const names=crewNames(c.names);if(names.length!==c.people || new Set(names.map(n=>n.toLowerCase())).size!==names.length)return {error:"names"};
      for(const n of names) { const key=n.toLocaleLowerCase();people.set(key,(people.get(key)??0)+c.hours);if(people.get(key)!>16)return {error:"hours"}; }
    }
  }
  if(submit && totalWeekHours(days)<=0)return {error:"noHours"};
  return {days};
}
export const supplierInvoiceSchema=z.object({
  legalName:z.string().trim().min(2).max(180),taxId:z.string().trim().min(5).max(40),address:z.string().trim().min(8).max(350),
  email:z.email().max(180),iban:z.string().trim().max(40).refine(s=>!s || validIban(s)),
  number:z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N} ._\/-]+$/u),date:dateSchema,
  vatRate:z.union([z.literal(0),z.literal(4),z.literal(10),z.literal(21)]),
  withholdingRate:z.union([z.literal(0),z.literal(7),z.literal(15),z.literal(19)]),taxNote:z.string().trim().max(500),
  confirmed:z.literal(true),
}).refine(v=>v.vatRate!==0 || v.taxNote.length>=10,{path:["taxNote"]});
export type SupplierInvoiceInput=z.infer<typeof supplierInvoiceSchema>;
export type WorkerInvoice=SupplierInvoiceInput & { customer:{name:string;taxId:string;address:string};hours:number;rate:number;subtotal:number;vat:number;withholding:number;total:number;language:WeekLang;projectName:string;weekStart:string };
export function validIban(raw:string) {
  const s=raw.replace(/\s/g,"").toUpperCase();if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s))return false;
  const moved=s.slice(4)+s.slice(0,4);let remainder=0;
  for(const c of moved)for(const n of /[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c)remainder=(remainder*10+Number(n))%97;
  return remainder===1;
}
export function invoiceKey(taxId:string,number:string) {return `${taxId.replace(/[^a-z0-9]/gi,"").toUpperCase()}:${number.replace(/[^\p{L}\p{N}]/gu,"").toUpperCase()}`;}
export function invoiceAmounts(hours:number,rate:number,vatRate:number,withholdingRate:number) {
  const cents=Math.round((hours*rate+Number.EPSILON)*100);const vat=Math.round(cents*vatRate/100),withholding=Math.round(cents*withholdingRate/100);
  return {subtotal:cents/100,vat:vat/100,withholding:withholding/100,total:(cents+vat-withholding)/100};
}
export type WeekEvent={at:string;action:string;actor:string;version:number;reason?:string;days?:WeekDay[];invoice?:WorkerInvoice};
