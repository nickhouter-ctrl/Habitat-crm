import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Offertes" };

export default function QuotesPage() {
  return (
    <DocumentsList
      kind="estimate"
      title="Offertes"
      subtitle="Uitgebrachte offertes — aangemaakt in het CRM of gesynct vanuit Holded"
      newLabel="Nieuwe offerte"
    />
  );
}
