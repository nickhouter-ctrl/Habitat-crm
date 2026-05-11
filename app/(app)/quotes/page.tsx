import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Offertes" };

export default function QuotesPage() {
  return (
    <DocumentsList
      kind="estimate"
      title="Offertes"
      subtitle="Uitgebrachte offertes (estimates), gesynct vanuit Holded"
    />
  );
}
