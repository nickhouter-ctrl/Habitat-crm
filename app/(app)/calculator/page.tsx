import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contacts, projects } from "@/lib/db/schema";
import { loadCalculatorData } from "@/lib/calculator-data";
import { QuoteConfigurator } from "@/components/quote-configurator";
import { PageHeader, LinkButton } from "@/components/ui";

export const metadata={title:"Offerte-configurator"};
export default async function CalculatorPage() {
  const [session,data,contactRows,projectRows]=await Promise.all([
    auth(),loadCalculatorData(),
    db.select({id:contacts.id,name:contacts.name}).from(contacts).orderBy(asc(contacts.name)),
    db.select({id:projects.id,name:projects.name}).from(projects).orderBy(asc(projects.name)),
  ]);
  return <><PageHeader title="Offerte-configurator" subtitle="Stel het werk samen, controleer de opbouw en maak een conceptofferte." actions={<LinkButton href="/calculator/prijzen" variant="secondary">Prijscontrole</LinkButton>}/>
    <QuoteConfigurator data={data} contacts={contactRows} projects={projectRows} userId={session?.user?.id??""}/></>;
}
