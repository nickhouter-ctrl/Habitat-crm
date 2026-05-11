import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Facturen" };

export default function InvoicesPage() {
  return (
    <DocumentsList
      kind="invoice"
      title="Facturen"
      subtitle="Verkoopfacturen, gesynct vanuit Holded"
    />
  );
}
