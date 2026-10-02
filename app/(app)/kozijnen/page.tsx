import { tekst as uiTranslation } from '@/lib/i18n/server';
import { ExternalLink } from "lucide-react";
import { PageHeader, LinkButton } from "@/components/ui";
import { WindowsOverview } from "@/components/windows-overview";
import { getWindowsReport } from "@/lib/windows-report";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Kozijnen") };
}
export const dynamic = "force-dynamic";

export default async function WindowsPage() {
  const uiT = await uiTranslation();
  const report=await getWindowsReport();
  return <><PageHeader title={uiT("Kozijnen")} subtitle={uiT("Offertes, orders en betalingen · Habitat One Windows")} actions={<>
    <LinkButton href="/kozijnen/portaal?next=/dealer" variant="secondary" target="_blank" rel="noreferrer" prefetch={false}>{uiT("Eigen projecten")}</LinkButton>
    <LinkButton href="/kozijnen/portaal?next=/admin" target="_blank" rel="noreferrer" prefetch={false}><ExternalLink className="size-4"/>{uiT("Windows openen")}</LinkButton>
  </>}/><WindowsOverview report={report}/></>;
}
