import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Voorschotten" };

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
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind={["proforma", "fondos"]}
      title="Voorschotten"
      subtitle="Proforma's en provisiones de fondos — betaalde voorschotten verrekenen automatisch op de eindfactuur"
      newLabel="Nieuw voorschot"
    />
  );
}
