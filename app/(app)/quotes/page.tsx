import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Offertes" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind="estimate"
      title="Offertes"
      subtitle="Uitgebrachte offertes — aangemaakt in het CRM of gesynct vanuit Holded"
      newLabel="Nieuwe offerte"
    />
  );
}
