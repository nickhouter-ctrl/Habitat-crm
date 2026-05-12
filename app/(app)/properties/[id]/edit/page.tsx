import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PropertyForm } from "@/components/property-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { getPropertyFormOptions } from "../../../_options";
import { updateProperty } from "../../actions";

export const metadata = { title: "Pand bewerken" };

export default async function EditPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [property, options] = await Promise.all([
    db.query.properties.findFirst({ where: eq(properties.id, id) }),
    getPropertyFormOptions(),
  ]);
  if (!property) notFound();

  const update = updateProperty.bind(null, id);

  return (
    <>
      <PageHeader
        title="Pand bewerken"
        subtitle={property.title}
        actions={
          <Link href={`/properties/${id}`} className="text-sm text-muted hover:underline">
            ← Terug
          </Link>
        }
      />
      {sp.error === "validation" && (
        <p className="mb-4 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Controleer de gegevens (titel verplicht).
        </p>
      )}
      <PropertyForm
        action={update}
        property={property}
        contacts={options.contacts}
        users={options.users}
        submitLabel="Wijzigingen opslaan"
      />
    </>
  );
}
