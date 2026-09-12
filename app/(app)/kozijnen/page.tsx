import { ExternalLink } from "lucide-react";
import { PageHeader, LinkButton } from "@/components/ui";
import { WindowsOverview } from "@/components/windows-overview";
import { getWindowsReport } from "@/lib/windows-report";

export const metadata = { title: "Kozijnen" };
export const dynamic = "force-dynamic";

export default async function WindowsPage() {
  const report=await getWindowsReport();
  return <><PageHeader title="Kozijnen" subtitle="Offertes, orders en betalingen · Habitat One Windows" actions={<>
    <LinkButton href="/kozijnen/portaal?next=/dealer" variant="secondary" target="_blank" rel="noreferrer" prefetch={false}>Eigen projecten</LinkButton>
    <LinkButton href="/kozijnen/portaal?next=/admin" target="_blank" rel="noreferrer" prefetch={false}><ExternalLink className="size-4"/>Windows openen</LinkButton>
  </>}/><WindowsOverview report={report}/></>;
}
