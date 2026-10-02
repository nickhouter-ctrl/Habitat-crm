import { tekst as uiTranslation } from '@/lib/i18n/server';
import { DocumentsList } from "../_documents-list";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Pakbonnen") };
}

export default async function PakbonnenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const uiT = await uiTranslation();
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind="deliverynote"
      title={uiT("Pakbonnen")}
      subtitle={uiT("Leverbonnen / albaranes — wat er geleverd is naar een klant of project")}
      newLabel="Nieuwe pakbon"
    />
  );
}
