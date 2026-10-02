import { tekst as uiTranslation } from '@/lib/i18n/server';
import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contacts, projects } from "@/lib/db/schema";
import { loadCalculatorData } from "@/lib/calculator-data";
import { QuoteConfigurator } from "@/components/quote-configurator";
import { PageHeader, LinkButton } from "@/components/ui";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return {title:uiT("Offerte-configurator")};
}
export default async function CalculatorPage() {
  const uiT = await uiTranslation();
  const [session,data,contactRows,projectRows]=await Promise.all([
    auth(),loadCalculatorData(),
    db.select({id:contacts.id,name:contacts.name}).from(contacts).orderBy(asc(contacts.name)),
    db.select({id:projects.id,name:projects.name}).from(projects).orderBy(asc(projects.name)),
  ]);
  return <><PageHeader title={uiT("Offerte-configurator")} subtitle={uiT("Stel het werk samen, controleer de opbouw en maak een conceptofferte.")} actions={<LinkButton href="/calculator/prijzen" variant="secondary">{uiT("Prijscontrole")}</LinkButton>}/>
    <QuoteConfigurator data={data} contacts={contactRows} projects={projectRows} userId={session?.user?.id??""}/></>;
}
