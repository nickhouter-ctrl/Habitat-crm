import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DealForm } from "@/components/deal-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { deals } from "@/lib/db/schema";
import { getDealFormOptions } from "../../../_options";
import { updateDeal } from "../../actions";

export const metadata = { title: "Deal bewerken" };

export default async function EditDealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [deal, options] = await Promise.all([
    db.query.deals.findFirst({ where: eq(deals.id, id) }),
    getDealFormOptions(),
  ]);
  if (!deal) notFound();

  const update = updateDeal.bind(null, id);

  return (
    <>
      <PageHeader
        title="Deal bewerken"
        subtitle={deal.title}
        actions={
          <Link href={`/deals/${id}`} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
        }
      />
      {sp.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (titel verplicht).
        </p>
      )}
      <DealForm
        action={update}
        deal={deal}
        contacts={options.contacts}
        properties={options.properties}
        users={options.users}
        submitLabel="Wijzigingen opslaan"
      />
    </>
  );
}
