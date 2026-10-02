import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { RowLink } from "@/components/row-link";
import { asStringArray } from "@/lib/documents";

import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  LinkButton,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { gewoneAanvragen } from "@/lib/aanvraag-selectie";
import { requireModuleRead } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Aanvragen") };
}

const STATUS_META: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" | "neutral" }> = {
  pending: { label: "Open", tone: "info" },
  accepted: { label: "Geaccepteerd", tone: "success" },
  rejected: { label: "Afgewezen", tone: "neutral" },
};

export default async function QuoteRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  await requireModuleRead('aanvragen');
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";

  const [rows, [counts]] = await Promise.all([
    db.query.quoteRequests.findMany({
      where: and(gewoneAanvragen, status ? eq(quoteRequests.status, status) : undefined),
      orderBy: desc(quoteRequests.createdAt),
      limit: 200,
    }),
    db
      .select({
        pending: sql<number>`count(case when status = 'pending' then 1 end)::int`,
        accepted: sql<number>`count(case when status = 'accepted' then 1 end)::int`,
        rejected: sql<number>`count(case when status = 'rejected' then 1 end)::int`,
      })
      .from(quoteRequests).where(gewoneAanvragen),
  ]);

  return (
    <>
      <PageHeader
        title={uiT("Aanvragen")}
        subtitle={uiT("Offerte-aanvragen via de website — bekijk, accepteer of wijs af.")}
        actions={<LinkButton href="/beurs/contacten" variant="secondary">{uiT("Beurscontacten")}</LinkButton>}
      />

      <p className="mb-4 text-sm text-muted">{uiT("De contacten van de beurs staan bij")} <Link href="/beurs/contacten" className="text-accent underline">{uiT("Beurscontacten")}</Link>{uiT(". Persoonlijke mails en afspraken beheer je bij")} <Link href="/opvolging" className="text-accent underline">{uiT("Opvolging")}</Link>.</p>

      <p className="mb-4 text-sm"><Link href="/accounts?source=windows" className="text-accent underline">{uiT("Aanvragen kozijnensysteem bekijken en goedkeuren →")}</Link></p>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/aanvragen?status=pending" className="block">
          <StatTile label={uiT("Open")} value={counts?.pending ?? 0} hint={uiT("wacht op behandeling")} />
        </Link>
        <Link href="/aanvragen?status=accepted" className="block">
          <StatTile label={uiT("Geaccepteerd")} value={counts?.accepted ?? 0} />
        </Link>
        <Link href="/aanvragen?status=rejected" className="block">
          <StatTile label={uiT("Afgewezen")} value={counts?.rejected ?? 0} />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        <Link
          href="/aanvragen"
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            !status ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground"
          }`}
        >
          {uiT("Alles")} </Link>
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <Link
            key={key}
            href={`/aanvragen?status=${key}`}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              status === key ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {uiT(meta.label)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={status === "pending" ? uiT("Geen openstaande aanvragen") : uiT("Geen aanvragen")}
          description={uiT("Aanvragen via 'Vraag offerte aan' op de website verschijnen hier.")}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>{uiT("Klant")}</Th>
                <Th>{uiT("Bedrijf")}</Th>
                <Th>{uiT("Producten")}</Th>
                <Th>{uiT("Status")}</Th>
                <Th>{uiT("Ontvangen")}</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.pending;
                const products = asStringArray(r.productNames);
                return (
                  <RowLink key={r.id} href={`/aanvragen/${r.id}`}>
                    <Td>
                      <span className="font-medium">
                        {r.kind === "appointment" ? "📅 " : r.kind === "contact" ? "✉️ " : ""}
                        {r.name}
                      </span>
                      <span className="block text-xs text-muted">{r.email}</span>
                    </Td>
                    <Td className="text-muted">{r.company ?? "—"}</Td>
                    <Td className="text-muted">
                      {products.length === 0 ? (
                        <span className="text-xs">—</span>
                      ) : products.length === 1 ? (
                        <span className="text-xs">{products[0]}</span>
                      ) : (
                        <span className="text-xs">
                          {products[0]} <span className="text-muted">+{products.length - 1}</span>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={meta.tone}>{uiT(meta.label)}</Badge>
                    </Td>
                    <Td className="text-xs text-muted">{formatDate(r.createdAt, uiDateLocale)}</Td>
                  </RowLink>
                );
              })}
            </TBody>
          </Table>
          {rows.length === 0 && (
            <CardContent>
              <p className="text-sm text-muted">{uiT("Geen aanvragen.")}</p>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}
