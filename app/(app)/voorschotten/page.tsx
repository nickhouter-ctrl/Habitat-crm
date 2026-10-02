import { tekst as uiTranslation } from '@/lib/i18n/server';
import { DocumentsList } from "../_documents-list";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Voorschotten") };
}

/**
 * Alle voorschotdocumenten op één plek: proforma's en provisiones de fondos
 * (die laatste hebben geen eigen factuur-/offertelijst en waren anders alleen
 * via het project, de klant of zoeken te vinden).
 */
export default async function VoorschottenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const uiT = await uiTranslation();
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind={["proforma", "fondos"]}
      title={uiT("Voorschotten")}
      subtitle={uiT("Proforma's en provisiones de fondos — betaalde voorschotten verrekenen automatisch op de eindfactuur")}
      newLabel="Nieuw voorschot"
    />
  );
}
