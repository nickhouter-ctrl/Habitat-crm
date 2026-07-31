/**
 * Logboek — wie heeft wat gedaan.
 *
 * Het systeem legde dit al op 37 plekken vast (goedkeuringen, verstuurde
 * facturen, voorraadmutaties, wachtwoordwijzigingen), maar er was nergens een
 * scherm om het te lezen: je kwam alleen losse regels tegen op een klantkaart.
 *
 * Regels zonder naam zijn géén gat in de administratie: die komen van het
 * systeem zelf (nachtelijke herinneringen, mail-import) of van de klant (een
 * offerte die via de portaallink is geaccepteerd). Die staan er als zodanig bij.
 */
import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { db } from "@/lib/db";
import { activities, contacts, documents, users } from "@/lib/db/schema";

export const metadata = { title: "Logboek" };

const PERIODES = [
  { value: "7", label: "laatste 7 dagen" },
  { value: "30", label: "laatste 30 dagen" },
  { value: "90", label: "laatste 3 maanden" },
  { value: "365", label: "laatste jaar" },
  { value: "0", label: "alles" },
];

export default async function LogboekPage({
  searchParams,
}: {
  searchParams: Promise<{ wie?: string; q?: string; dagen?: string }>;
}) {
  const { wie = "", q = "", dagen = "30" } = await searchParams;
  const dagenNum = Number(dagen) || 0;

  // Datumgrens in SQL laten uitrekenen: een klok uitlezen tijdens het renderen
  // maakt de component onzuiver.
  const vanaf = dagenNum > 0 ? sql<Date>`now() - ${`${dagenNum} days`}::interval` : null;

  const filters = [
    vanaf ? gte(activities.createdAt, vanaf) : undefined,
    wie === "systeem" ? isNull(activities.authorId) : wie ? eq(activities.authorId, wie) : undefined,
    q ? or(ilike(activities.subject, `%${q}%`), ilike(activities.body, `%${q}%`)) : undefined,
  ].filter(Boolean);

  const [rijen, medewerkers, perPersoon] = await Promise.all([
    db
      .select({
        id: activities.id,
        type: activities.type,
        subject: activities.subject,
        body: activities.body,
        createdAt: activities.createdAt,
        door: users.name,
        doorEmail: users.email,
        contactId: activities.contactId,
        contactName: contacts.name,
        documentId: activities.documentId,
        docNumber: documents.docNumber,
      })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.authorId))
      .leftJoin(contacts, eq(contacts.id, activities.contactId))
      .leftJoin(documents, eq(documents.id, activities.documentId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(activities.createdAt))
      .limit(300),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(users.email),
    // Wie heeft er in deze periode gewerkt in het systeem?
    db
      .select({
        naam: sql<string>`coalesce(${users.name}, ${users.email}, 'Systeem / klant')`,
        n: sql<number>`count(*)::int`,
      })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.authorId))
      .where(vanaf ? gte(activities.createdAt, vanaf) : undefined)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(6),
  ]);

  return (
    <>
      <PageHeader
        title="Logboek"
        subtitle="wie heeft wat gedaan — goedkeuringen, verstuurde post, voorraad en instellingen"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {perPersoon.map((p) => (
          <StatTile key={p.naam} label={p.naam} value={p.n} hint="handelingen" />
        ))}
      </div>

      <Card className="mb-5">
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.6fr_auto] lg:items-end">
            <Field label="Wie" htmlFor="wie">
              <Select id="wie" name="wie" defaultValue={wie}>
                <option value="">iedereen</option>
                {medewerkers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
                <option value="systeem">systeem / klant</option>
              </Select>
            </Field>
            <Field label="Periode" htmlFor="dagen">
              <Select id="dagen" name="dagen" defaultValue={dagen}>
                {PERIODES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Zoeken" htmlFor="q" hint="in onderwerp en toelichting">
              <Input id="q" name="q" defaultValue={q} placeholder="bijv. goedgekeurd, Ferhaoui, voorraad" />
            </Field>
            <button
              type="submit"
              className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Filteren
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Handelingen</CardTitle>
          <span className="text-xs text-muted">
            {rijen.length === 300 ? "laatste 300 (filter verder om ouder terug te zien)" : `${rijen.length} regels`}
          </span>
        </CardHeader>
        {rijen.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">Niets gevonden in deze periode.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Wanneer</Th>
                <Th>Wie</Th>
                <Th>Wat</Th>
                <Th>Bij</Th>
              </tr>
            </THead>
            <TBody>
              {rijen.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {r.createdAt.toLocaleString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {r.door ? (
                      <span className="font-medium">{r.door}</span>
                    ) : (
                      <Badge tone="neutral">systeem / klant</Badge>
                    )}
                  </Td>
                  <Td>
                    {r.subject ?? "—"}
                    {r.body ? <span className="block text-xs text-muted">{r.body}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {r.documentId && r.docNumber ? (
                      <Link href={`/documents/${r.documentId}`} className="text-accent hover:underline">
                        {r.docNumber}
                      </Link>
                    ) : r.contactId && r.contactName ? (
                      <Link href={`/contacts/${r.contactId}`} className="text-accent hover:underline">
                        {r.contactName}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
