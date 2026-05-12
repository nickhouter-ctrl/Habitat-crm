import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Facturen" };

export default function InvoicesPage() {
  return (
    <DocumentsList
      kind={["invoice", "creditnote"]}
      title="Facturen"
      subtitle="Verkoopfacturen en creditnota's — aangemaakt in het CRM of gesynct vanuit Holded"
      newLabel="Nieuwe factuur"
    />
  );
}
