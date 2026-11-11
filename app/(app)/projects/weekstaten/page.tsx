import { requireModuleRead } from "@/lib/auth/guards";
import { WorkerWeekReviews } from "@/components/worker-week-reviews";
import { WorkerLumpInvoiceReviews } from "@/components/worker-lump-invoice-reviews";
import { PageHeader, LinkButton } from "@/components/ui";

export const metadata={title:"Weekstaten controleren"};
export default async function WorkerWeeksPage() {
  await requireModuleRead("projects");
  return <><PageHeader title="Weekstaten controleren" subtitle="Alle ingediende weekstaten bij elkaar. Concepten blijven bij de medewerker tot die op indienen klikt." actions={<LinkButton href="/projects">Projecten</LinkButton>}/><WorkerLumpInvoiceReviews pendingOnly/><WorkerWeekReviews pendingOnly/></>;
}
