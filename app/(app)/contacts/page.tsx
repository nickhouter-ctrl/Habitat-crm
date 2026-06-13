import { and, desc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
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

const SOORT_TABS = [
  { key: "", label: "Alle soorten" },
  { key: "zakelijk", label: "Zakelijk" },
  { key: "particulier", label: "Particulier" },
] as const;

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
  const soortParam = typeof params.soort === "string" ? params.soort : "";
  const soortFilter = SOORT_TABS.some((t) => t.key === soortParam) ? soortParam : "";

  const rows = await db.query.contacts.findMany({
    where: and(
      q
        ? or(ilike(contacts.name, `%${q}%`), ilike(contacts.email, `%${q}%`))
        : undefined,
      typeFilter ? eq(contacts.type, typeFilter) : undefined,
      // Zakelijk = gekoppeld aan een bedrijf; particulier = geen bedrijf.
      soortFilter === "zakelijk"
        ? isNotNull(contacts.companyId)
        : soortFilter === "particulier"
          ? isNull(contacts.companyId)
          : undefined,
    ),
    orderBy: desc(contacts.updatedAt),
    limit: 200,
    with: {
      owner: { columns: { name: true } },
      company: { columns: { id: true, name: true } },
    },
  });

  const filterHref = (next: { type?: string; soort?: string }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const t = next.type ?? typeFilter;
    const s = next.soort ?? soortFilter;
    if (t) sp.set("type", t);
    if (s) sp.set("soort", s);
    const qs = sp.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  };
  const tabHref = (key: string) => filterHref({ type: key });

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
        <div className="flex flex-wrap items-center gap-3">
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
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
          <div className="flex flex-wrap gap-1">
            {SOORT_TABS.map((t) => (
              <Link
                key={t.key || "all-soort"}
                href={filterHref({ soort: t.key })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  (soortFilter || "") === t.key
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
        <form className="relative" action="/contacts">
          {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
          {soortFilter && <input type="hidden" name="soort" value={soortFilter} />}
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
