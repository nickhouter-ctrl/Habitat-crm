import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Facturen" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind={["invoice", "creditnote"]}
      title="Facturen"
      subtitle="Verkoopfacturen en creditnota's — aangemaakt in het CRM of gesynct vanuit Holded"
      newLabel="Nieuwe factuur"
    />
  );
}
