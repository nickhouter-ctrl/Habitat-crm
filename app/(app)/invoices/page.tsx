import { tekst as uiTranslation } from '@/lib/i18n/server';
import { DocumentsList } from "../_documents-list";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Facturen") };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const uiT = await uiTranslation();
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind={["invoice", "creditnote"]}
      title={uiT("Facturen")}
      subtitle={uiT("Verkoopfacturen en creditnota's — aangemaakt in het CRM of gesynct vanuit Holded")}
      newLabel="Nieuwe factuur"
    />
  );
}
