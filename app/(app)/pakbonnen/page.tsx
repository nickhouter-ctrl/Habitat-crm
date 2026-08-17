import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Pakbonnen" };

export default async function PakbonnenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <DocumentsList
      searchParams={await searchParams}
      kind="deliverynote"
      title="Pakbonnen"
      subtitle="Leverbonnen / albaranes — wat er geleverd is naar een klant of project"
      newLabel="Nieuwe pakbon"
    />
  );
}
