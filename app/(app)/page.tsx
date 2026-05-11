import { and, count, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { contacts, deals, documents, properties } from "@/lib/db/schema";
import { formatDate, formatEUR } from "@/lib/utils";
import { dealStageMeta, leadStageMeta } from "./_meta";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [
    [contactsTotal],
    [leadsTotal],
    [openDealsRow],
    [propsAvailable],
    [invoicesOpen],
    recentContacts,
    recentDeals,
  ] = await Promise.all([
    db.select({ n: count() }).from(contacts),
    db.select({ n: count() }).from(contacts).where(eq(contacts.type, "lead")),
    db
      .select({
        n: count(),
        value: sql<string>`coalesce(sum(${deals.valueEur}), 0)`,
      })
      .from(deals)
      .where(notInArray(deals.stage, ["won", "lost"])),
    db
      .select({ n: count() })
      .from(properties)
      .where(eq(properties.status, "available")),
    db
      .select({ n: count() })
      .from(documents)
      .where(and(eq(documents.kind, "invoice"), ne(documents.status, "paid"))),
    db.query.contacts.findMany({
      orderBy: desc(contacts.createdAt),
      limit: 6,
      with: { owner: { columns: { name: true } } },
    }),
    db.query.deals.findMany({
      orderBy: desc(deals.updatedAt),
      limit: 6,
      with: { contact: { columns: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overzicht van contacten, deals, panden en facturen"
        actions={
          <LinkButton href="/contacts/new" size="md">
            Nieuw contact
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Contacten" value={contactsTotal.n} />
        <StatTile label="Leads" value={leadsTotal.n} hint="type = lead" />
        <StatTile
          label="Open deals"
          value={openDealsRow.n}
          hint={formatEUR(openDealsRow.value)}
        />
        <StatTile label="Panden beschikbaar" value={propsAvailable.n} />
        <StatTile label="Openstaande facturen" value={invoicesOpen.n} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recente contacten</CardTitle>
            <Link href="/contacts" className="text-xs text-accent hover:underline">
              Alles bekijken
            </Link>
          </CardHeader>
          {recentContacts.length === 0 ? (
            <CardContent>
              <EmptyState
                title="Nog geen contacten"
                description="Voeg een contact toe of synchroniseer met Holded."
                action={
                  <LinkButton href="/contacts/new" size="sm">
                    Nieuw contact
                  </LinkButton>
                }
              />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Naam</Th>
                  <Th>Type</Th>
                  <Th>Eigenaar</Th>
                  <Th>Toegevoegd</Th>
                </tr>
              </THead>
              <TBody>
                {recentContacts.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <Link
                        href={`/contacts/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.email && (
                        <span className="block text-xs text-muted">{c.email}</span>
                      )}
                    </Td>
                    <Td>
                      {c.type === "lead" ? (
                        <Badge tone={leadStageMeta[c.stage].tone}>
                          {leadStageMeta[c.stage].label}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">{c.type}</Badge>
                      )}
                    </Td>
                    <Td className="text-muted">{c.owner?.name ?? "—"}</Td>
                    <Td className="text-muted">{formatDate(c.createdAt)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recente deals</CardTitle>
            <Link href="/deals" className="text-xs text-accent hover:underline">
              Alles bekijken
            </Link>
          </CardHeader>
          {recentDeals.length === 0 ? (
            <CardContent>
              <EmptyState title="Nog geen deals" />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Deal</Th>
                  <Th>Fase</Th>
                  <Th className="text-right">Waarde</Th>
                </tr>
              </THead>
              <TBody>
                {recentDeals.map((d) => (
                  <Tr key={d.id}>
                    <Td>
                      <Link
                        href={`/deals?focus=${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.title}
                      </Link>
                      {d.contact?.name && (
                        <span className="block text-xs text-muted">
                          {d.contact.name}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={dealStageMeta[d.stage].tone}>
                        {dealStageMeta[d.stage].label}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatEUR(d.valueEur)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
