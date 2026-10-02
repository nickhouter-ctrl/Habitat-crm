import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { PropertyPhotos } from "@/components/property-photos";
import { db } from "@/lib/db";
import { projects, properties } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { propertyStatusMeta, propertyTypeMeta } from "../../_meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await db.query.properties.findFirst({
    where: eq(properties.id, id),
    columns: { title: true },
  });
  return { title: p?.title ?? "Pand" };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const { id } = await params;

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, id),
    with: {
      ownerContact: { columns: { id: true, name: true } },
      owner: { columns: { name: true } },
    },
  });
  if (!property) notFound();

  const relatedProjects = await db.query.projects.findMany({
    where: eq(projects.propertyId, id),
    orderBy: desc(projects.updatedAt),
    with: { contact: { columns: { id: true, name: true } } },
  });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {property.title}
            <Badge tone={propertyStatusMeta[property.status].tone}>
              {uiT(propertyStatusMeta[property.status].label)}
            </Badge>
            {!property.isPublished && <Badge tone="neutral">{uiT("niet gepubliceerd")}</Badge>}
          </span>
        }
        subtitle={
          <>
            {uiT(propertyTypeMeta[property.type])}
            {property.reference ? ` · ${property.reference}` : ""}
            {property.location ? ` · ${property.location}` : ""}
          </>
        }
        actions={
          <>
            <Link href="/properties" className="text-sm text-muted hover:underline">
              {uiT("← Panden")} </Link>
            <LinkButton href={`/properties/${id}/edit`} variant="secondary">
              {uiT("Bewerken")} </LinkButton>
          </>
        }
      />

      <PropertyPhotos propertyId={property.id} images={property.images ?? []} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Gegevens")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">{uiT("Vraagprijs")}</dt>
                <dd className="font-medium tabular-nums">{formatEUR(property.priceEur)}</dd>
                <dt className="text-muted">{uiT("Slaapkamers")}</dt>
                <dd>{property.bedrooms ?? "—"}</dd>
                <dt className="text-muted">{uiT("Badkamers")}</dt>
                <dd>{property.bathrooms ?? "—"}</dd>
                <dt className="text-muted">{uiT("Bebouwd")}</dt>
                <dd>{property.builtSqm ? uiT("{v0} m²", { v0: property.builtSqm }) : "—"}</dd>
                <dt className="text-muted">{uiT("Perceel")}</dt>
                <dd>{property.plotSqm ? uiT("{v0} m²", { v0: property.plotSqm }) : "—"}</dd>
                <dt className="text-muted">{uiT("Eigenaar")}</dt>
                <dd>
                  {property.ownerContact ? (
                    <Link
                      href={`/contacts/${property.ownerContact.id}`}
                      className="hover:underline"
                    >
                      {property.ownerContact.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-muted">{uiT("Verantwoordelijke")}</dt>
                <dd>{property.owner?.name ?? "—"}</dd>
                <dt className="text-muted">{uiT("Aangemaakt")}</dt>
                <dd>{formatDate(property.createdAt, uiDateLocale)}</dd>
              </dl>
            </CardContent>
          </Card>

          {property.description && (
            <Card>
              <CardHeader>
                <CardTitle>{uiT("Omschrijving")}</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {property.description}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{uiT("Projecten bij dit pand")}</CardTitle>
              <LinkButton href="/projects/new" variant="secondary" size="sm">
                {uiT("Nieuw project")} </LinkButton>
            </CardHeader>
            {relatedProjects.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">{uiT("Geen gekoppelde projecten.")}</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>{uiT("Project")}</Th>
                    <Th>{uiT("Contact")}</Th>
                    <Th className="text-right">{uiT("Status")}</Th>
                  </tr>
                </THead>
                <TBody>
                  {relatedProjects.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-medium">
                        <Link href={`/projects/${p.id}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </Td>
                      <Td>
                        {p.contact ? (
                          <Link href={`/contacts/${p.contact.id}`} className="hover:underline">
                            {p.contact.name}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="text-right">
                        <Badge tone={p.status === "active" ? "success" : "neutral"}>
                          {p.status === "active" ? uiT("Actief") : uiT("Gearchiveerd")}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
