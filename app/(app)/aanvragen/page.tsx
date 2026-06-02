import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { RowLink } from "@/components/row-link";
import { asStringArray } from "@/lib/documents";

import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { db } from "@/lib/db";
import { quoteRequests } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Aanvragen" };

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
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";

  const [rows, [counts]] = await Promise.all([
    db.query.quoteRequests.findMany({
      where: status ? eq(quoteRequests.status, status) : undefined,
      orderBy: desc(quoteRequests.createdAt),
      limit: 200,
    }),
    db
      .select({
        pending: sql<number>`count(case when status = 'pending' then 1 end)::int`,
        accepted: sql<number>`count(case when status = 'accepted' then 1 end)::int`,
        rejected: sql<number>`count(case when status = 'rejected' then 1 end)::int`,
      })
      .from(quoteRequests),
  ]);

  return (
    <>
      <PageHeader
        title="Aanvragen"
        subtitle="Offerte-aanvragen via de website — bekijk, accepteer of wijs af."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/aanvragen?status=pending" className="block">
          <StatTile label="Open" value={counts?.pending ?? 0} hint="wacht op behandeling" />
        </Link>
        <Link href="/aanvragen?status=accepted" className="block">
          <StatTile label="Geaccepteerd" value={counts?.accepted ?? 0} />
        </Link>
        <Link href="/aanvragen?status=rejected" className="block">
          <StatTile label="Afgewezen" value={counts?.rejected ?? 0} />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        <Link
          href="/aanvragen"
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            !status ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground"
          }`}
        >
          Alles
        </Link>
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <Link
            key={key}
            href={`/aanvragen?status=${key}`}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              status === key ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {meta.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={status === "pending" ? "Geen openstaande aanvragen" : "Geen aanvragen"}
          description="Aanvragen via 'Vraag offerte aan' op de website verschijnen hier."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Klant</Th>
                <Th>Bedrijf</Th>
                <Th>Producten</Th>
                <Th>Status</Th>
                <Th>Ontvangen</Th>
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
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td className="text-xs text-muted">{formatDate(r.createdAt)}</Td>
                  </RowLink>
                );
              })}
            </TBody>
          </Table>
          {rows.length === 0 && (
            <CardContent>
              <p className="text-sm text-muted">Geen aanvragen.</p>
            </CardContent>
          )}
        </Card>
      )}
    </>
  );
}
