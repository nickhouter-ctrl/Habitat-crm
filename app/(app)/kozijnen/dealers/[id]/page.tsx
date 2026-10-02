import { tekst as uiTranslation } from '@/lib/i18n/server';
import { notFound } from "next/navigation";
import { PageHeader, LinkButton } from "@/components/ui";
import { WindowsOverview } from "@/components/windows-overview";
import { getWindowsReport } from "@/lib/windows-report";
import { filterWindowsDealer, summarizeWindows, windowsPortalHref } from "@/lib/windows-financials";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return {title:uiT("Windows-dealer")};
}
export default async function WindowsDealerPage({params}:{params:Promise<{id:string}>}) {
  const uiT = await uiTranslation();
  const {id}=await params;
  const all=await getWindowsReport();
  const dealer=all.dealers.find(d=>d.id===id);
  if(!dealer) notFound();
  const data=filterWindowsDealer(all,id);
  const report={...data,...summarizeWindows(data)};
  return <><PageHeader title={dealer.companyName||dealer.email} subtitle={uiT("Windows-dealer · {v0}", { v0: dealer.email })} actions={<>
    <LinkButton href="/kozijnen" variant="secondary">{uiT("Alle kozijnen")}</LinkButton>
    {dealer.contactId&&<LinkButton href={`/contacts/${dealer.contactId}?tab=kozijnen`} variant="secondary">{uiT("CRM-klantdossier")}</LinkButton>}
    <LinkButton href={windowsPortalHref(`/admin/dealers/${id}`)} target="_blank" rel="noreferrer" prefetch={false}>{uiT("Windows-dashboard")}</LinkButton>
  </>}/><WindowsOverview report={report} scoped/></>;
}
