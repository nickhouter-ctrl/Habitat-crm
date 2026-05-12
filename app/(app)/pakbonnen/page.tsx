import { DocumentsList } from "../_documents-list";

export const metadata = { title: "Pakbonnen" };

export default function PakbonnenPage() {
  return (
    <DocumentsList
      kind="deliverynote"
      title="Pakbonnen"
      subtitle="Leverbonnen / albaranes — wat er geleverd is naar een klant of project"
      newLabel="Nieuwe pakbon"
    />
  );
}
