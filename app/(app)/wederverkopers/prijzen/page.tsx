import Link from "next/link";
import { Card, CardContent, PageHeader, Field, Select } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { DealerPricing } from "@/components/dealer-pricing";
import { requireModuleRead } from "@/lib/auth/guards";
import { buildDistributeurItems } from "@/lib/distributeur-prijslijst-data";
import { prijsOpties, prijsVoorstelInvoer } from "@/lib/distributeur-invoer";
import { tekst } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { mailDistributeurPrijslijst } from "@/app/(app)/prijslijst/distributeur/actions";

export const dynamic = "force-dynamic";
export async function generateMetadata() { const t = await tekst(); return { title: t("Staffels & marges verkooppunten") }; }
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const access = await requireModuleRead("verkoopprijzen");
  const t = await tekst(), sp = await searchParams;
  const parsed = prijsVoorstelInvoer.safeParse({staffel:sp.staffel,extra:sp.extra,serie:sp.serie});
  const invoer = parsed.success ? parsed.data : prijsVoorstelInvoer.parse({});
  const { items, series } = await buildDistributeurItems("ALL",prijsOpties(invoer));
  const klanten = access.heeftCap("schrijven") ? await db.select({id:contacts.id,name:contacts.name,email:contacts.email}).from(contacts).orderBy(contacts.name) : [];
  if (!series.includes(invoer.serie)) invoer.serie = "";
  return <div className="space-y-5"><PageHeader title={t("Staffels & marges verkooppunten")} subtitle={t("Flexible Stone · prijzen, showroom en samples")}/>
    <nav aria-label={t("Verkooppunten")} className="flex gap-6 border-b pb-3 text-sm"><Link href="/wederverkopers" className="text-muted hover:text-foreground">{t("Verkooppunten")}</Link><Link aria-current="page" href="/wederverkopers/prijzen" className="font-semibold text-accent">{t("Staffels & marges")}</Link></nav>
    {!parsed.success && <p role="alert" className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{t("Ongeldige prijsinstellingen. Het starttarief zonder extra kosten is getoond; kies je instellingen opnieuw.")}</p>}
    {sp.sent === "1" && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{t("De prijslijst is verstuurd.")}</p>}
    {typeof sp.error === "string" && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}
    <DealerPricing items={items} series={series} invoer={invoer} t={t} mailForm={access.heeftCap("schrijven") && <Card><CardContent><details><summary className="cursor-pointer font-medium text-accent">{t("Of mail hem direct naar een klant")}</summary>
      <form action={mailDistributeurPrijslijst} className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
        <Field label={t("Klant")} htmlFor="mail-contact"><Combobox name="contactId" options={klanten.filter(c=>c.email).map(c=>({value:c.id,label:`${c.name} <${c.email}>`}))} placeholder={t("Zoek klant…")}/></Field>
        <Field label={t("Taal")} htmlFor="mail-taal"><Select id="mail-taal" name="taal" defaultValue="es"><option value="es">Español</option><option value="en">English</option><option value="nl">Nederlands</option><option value="de">Deutsch</option></Select></Field>
        <input type="hidden" name="staffel" value={invoer.staffel}/><input type="hidden" name="extra" value={invoer.extra}/><input type="hidden" name="serie" value={invoer.serie}/>
        <div className="sm:col-span-2"><Field label={t("Bericht")} htmlFor="mail-bericht"><textarea id="mail-bericht" name="bericht" maxLength={10000} rows={3} className="w-full rounded-md border border-border bg-background p-3 text-sm"/></Field></div>
        <p className="text-xs text-muted sm:col-span-2">{t("Bekijk eerst de PDF hierboven. Versturen mailt dit prijsvoorstel met de geselecteerde instellingen.")}</p>
        <SubmitButton pendingLabel={t("Versturen…")}>{t("Verstuur per e-mail")}</SubmitButton>
      </form></details></CardContent></Card>}/>
  </div>;
}
