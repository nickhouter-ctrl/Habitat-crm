import Link from "next/link";

import { DealForm } from "@/components/deal-form";
import { PageHeader } from "@/components/ui";
import { getDealFormOptions } from "../../_options";
import { createDeal } from "../actions";

export const metadata = { title: "Nieuwe deal" };

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { contacts, properties, users } = await getDealFormOptions();
  const defaults = {
    contactId: typeof params.contactId === "string" ? params.contactId : undefined,
    propertyId: typeof params.propertyId === "string" ? params.propertyId : undefined,
  };

  return (
    <>
      <PageHeader
        title="Nieuwe deal"
        subtitle="Een renovatie, nieuwbouw, materiaallevering of verkoop"
        actions={
          <Link href="/deals" className="text-sm text-muted hover:underline">
            ← Deals
          </Link>
        }
      />
      {params.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (titel verplicht).
        </p>
      )}
      <DealForm
        action={createDeal}
        contacts={contacts}
        properties={properties}
        users={users}
        defaults={defaults}
        submitLabel="Deal aanmaken"
      />
    </>
  );
}
