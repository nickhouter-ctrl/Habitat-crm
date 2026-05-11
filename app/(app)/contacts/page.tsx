import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Search } from "lucide-react";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  Input,
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
import { contacts } from "@/lib/db/schema";
import { cn, formatDate } from "@/lib/utils";
import { SyncHoldedButton } from "@/components/sync-holded-button";
import { contactTypeMeta, leadStageMeta } from "../_meta";

export const metadata = { title: "Contacten" };

const TYPE_TABS = [
  { key: "", label: "Alle" },
  { key: "lead", label: "Leads" },
  { key: "customer", label: "Klanten" },
  { key: "owner", label: "Eigenaren" },
  { key: "supplier", label: "Leveranciers" },
] as const;

type ContactType = keyof typeof contactTypeMeta;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const typeParam = typeof params.type === "string" ? params.type : "";
  const typeFilter = (TYPE_TABS.some((t) => t.key === typeParam) ? typeParam : "") as
    | ContactType
    | "";

  const rows = await db.query.contacts.findMany({
    where: and(
      q
        ? or(ilike(contacts.name, `%${q}%`), ilike(contacts.email, `%${q}%`))
        : undefined,
      typeFilter ? eq(contacts.type, typeFilter) : undefined,
    ),
    orderBy: desc(contacts.updatedAt),
    limit: 200,
    with: {
      owner: { columns: { name: true } },
      company: { columns: { id: true, name: true } },
    },
  });

  const tabHref = (key: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (key) sp.set("type", key);
    const s = sp.toString();
    return s ? `/contacts?${s}` : "/contacts";
  };

  return (
    <>
      <PageHeader
        title="Contacten"
        subtitle={`${rows.length} ${rows.length === 1 ? "contact" : "contacten"}`}
        actions={
          <>
            <SyncHoldedButton />
            <LinkButton href="/contacts/new">Nieuw contact</LinkButton>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {TYPE_TABS.map((t) => (
            <Link
              key={t.key || "all"}
              href={tabHref(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                (typeFilter || "") === t.key
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form className="relative" action="/contacts">
          {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Zoek op naam of e-mail…"
            className="w-64 pl-8"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q || typeFilter ? "Geen contacten gevonden" : "Nog geen contacten"}
          description={
            q || typeFilter
              ? "Pas je zoekopdracht of filter aan."
              : "Voeg het eerste contact toe of synchroniseer met Holded."
          }
          action={<LinkButton href="/contacts/new">Nieuw contact</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Naam</Th>
                <Th>Type / fase</Th>
                <Th>Bedrijf</Th>
                <Th>Contact</Th>
                <Th>Eigenaar</Th>
                <Th>Bijgewerkt</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.jobTitle && (
                      <span className="block text-xs text-muted">{c.jobTitle}</span>
                    )}
                  </Td>
                  <Td>
                    {c.type === "lead" ? (
                      <Badge tone={leadStageMeta[c.stage].tone}>
                        {leadStageMeta[c.stage].label}
                      </Badge>
                    ) : (
                      <Badge tone={contactTypeMeta[c.type].tone}>
                        {contactTypeMeta[c.type].label}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-muted">{c.company?.name ?? "—"}</Td>
                  <Td className="text-muted">
                    {c.email ?? c.mobile ?? c.phone ?? "—"}
                  </Td>
                  <Td className="text-muted">{c.owner?.name ?? "—"}</Td>
                  <Td className="text-muted">{formatDate(c.updatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
