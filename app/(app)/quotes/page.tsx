import { tekst as uiTranslation } from '@/lib/i18n/server';
import { DocumentsList } from "../_documents-list";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Offertes") };
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const uiT = await uiTranslation();
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind="estimate"
      title={uiT("Offertes")}
      subtitle={uiT("Uitgebrachte offertes — aangemaakt in het CRM of gesynct vanuit Holded")}
      newLabel="Nieuwe offerte"
    />
  );
}
