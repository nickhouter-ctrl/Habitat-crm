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
import { db } from "@/lib/db";
import { deals, properties } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { dealStageMeta, propertyStatusMeta, propertyTypeMeta } from "../../_meta";

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
  const { id } = await params;

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, id),
    with: {
      ownerContact: { columns: { id: true, name: true } },
      owner: { columns: { name: true } },
    },
  });
  if (!property) notFound();

  const relatedDeals = await db.query.deals.findMany({
    where: eq(deals.propertyId, id),
    orderBy: desc(deals.updatedAt),
    with: { contact: { columns: { id: true, name: true } } },
  });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {property.title}
            <Badge tone={propertyStatusMeta[property.status].tone}>
              {propertyStatusMeta[property.status].label}
            </Badge>
            {!property.isPublished && <Badge tone="neutral">niet gepubliceerd</Badge>}
          </span>
        }
        subtitle={
          <>
            {propertyTypeMeta[property.type]}
            {property.reference ? ` · ${property.reference}` : ""}
            {property.location ? ` · ${property.location}` : ""}
          </>
        }
        actions={
          <>
            <Link href="/properties" className="text-sm text-muted hover:underline">
              ← Panden
            </Link>
            <LinkButton href={`/properties/${id}/edit`} variant="secondary">
              Bewerken
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">Vraagprijs</dt>
                <dd className="font-medium tabular-nums">{formatEUR(property.priceEur)}</dd>
                <dt className="text-muted">Slaapkamers</dt>
                <dd>{property.bedrooms ?? "—"}</dd>
                <dt className="text-muted">Badkamers</dt>
                <dd>{property.bathrooms ?? "—"}</dd>
                <dt className="text-muted">Bebouwd</dt>
                <dd>{property.builtSqm ? `${property.builtSqm} m²` : "—"}</dd>
                <dt className="text-muted">Perceel</dt>
                <dd>{property.plotSqm ? `${property.plotSqm} m²` : "—"}</dd>
                <dt className="text-muted">Eigenaar</dt>
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
                <dt className="text-muted">Verantwoordelijke</dt>
                <dd>{property.owner?.name ?? "—"}</dd>
                <dt className="text-muted">Aangemaakt</dt>
                <dd>{formatDate(property.createdAt)}</dd>
              </dl>
            </CardContent>
          </Card>

          {property.description && (
            <Card>
              <CardHeader>
                <CardTitle>Omschrijving</CardTitle>
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
              <CardTitle>Deals bij dit pand</CardTitle>
              <LinkButton
                href={`/deals/new?propertyId=${property.id}`}
                variant="secondary"
                size="sm"
              >
                Nieuwe deal
              </LinkButton>
            </CardHeader>
            {relatedDeals.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Geen gekoppelde deals.</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <Th>Deal</Th>
                    <Th>Fase</Th>
                    <Th>Contact</Th>
                    <Th className="text-right">Waarde</Th>
                  </tr>
                </THead>
                <TBody>
                  {relatedDeals.map((d) => (
                    <Tr key={d.id}>
                      <Td className="font-medium">
                        <Link href={`/deals/${d.id}`} className="hover:underline">
                          {d.title}
                        </Link>
                      </Td>
                      <Td>
                        <Badge tone={dealStageMeta[d.stage].tone}>
                          {dealStageMeta[d.stage].label}
                        </Badge>
                      </Td>
                      <Td>
                        {d.contact ? (
                          <Link
                            href={`/contacts/${d.contact.id}`}
                            className="hover:underline"
                          >
                            {d.contact.name}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{formatEUR(d.valueEur)}</Td>
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
