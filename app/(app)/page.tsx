import { count, desc, eq, inArray, sql } from "drizzle-orm";
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
import { activities, contacts, deals, documents, purchaseOrders } from "@/lib/db/schema";
import { formatMoney, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { formatDate, formatEUR } from "@/lib/utils";
import { dealStageMeta, documentKindMeta } from "./_meta";

export const metadata = { title: "Dashboard" };

const PIPELINE_STAGES = ["lead", "qualified", "proposal", "negotiation", "won"] as const;

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Notitie",
  call: "Telefoon",
  email: "E-mail",
  meeting: "Afspraak",
  task: "Taak",
};

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const openExpr = sql`${documents.status} not in ('paid', 'void', 'draft')`;

  const [[contactsTotal], pipelineRows, [docAgg], openPurchaseOrders, recentDeals, recentActivity] =
    await Promise.all([
      db.select({ n: count() }).from(contacts),
      db
        .select({
          stage: deals.stage,
          n: count(),
          value: sql<string>`coalesce(sum(${deals.valueEur}), 0)`,
        })
        .from(deals)
        .groupBy(deals.stage),
      db
        .select({
          revenueMonth: sql<string>`coalesce(sum(case when ${documents.status} = 'paid' and ${documents.issueDate} >= ${monthStart} then ${documents.totalEur} else 0 end), 0)`,
          outstandingN: sql<number>`count(case when ${openExpr} then 1 end)::int`,
          outstandingV: sql<string>`coalesce(sum(case when ${openExpr} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
          overdueN: sql<number>`count(case when ${openExpr} and ${documents.dueDate} < ${today} then 1 end)::int`,
          overdueV: sql<string>`coalesce(sum(case when ${openExpr} and ${documents.dueDate} < ${today} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
        })
        .from(documents)
        .where(eq(documents.kind, "invoice")),
      db
        .select()
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.status, PO_OPEN_STATUSES))
        .orderBy(purchaseOrders.expectedDate),
      db.query.deals.findMany({
        orderBy: desc(deals.updatedAt),
        limit: 7,
        with: { contact: { columns: { name: true } } },
      }),
      db.query.activities.findMany({
        orderBy: desc(activities.createdAt),
        limit: 10,
        with: {
          author: { columns: { name: true } },
          contact: { columns: { id: true, name: true } },
          deal: { columns: { id: true, title: true } },
          document: { columns: { id: true, docNumber: true, kind: true } },
        },
      }),
    ]);

  const byStage = new Map(pipelineRows.map((r) => [r.stage, r]));
  const openDeals = pipelineRows
    .filter((r) => r.stage !== "won" && r.stage !== "lost")
    .reduce(
      (acc, r) => ({ n: acc.n + r.n, value: acc.value + Number(r.value ?? 0) }),
      { n: 0, value: 0 },
    );
  const pipeline = PIPELINE_STAGES.map((stage) => {
    const r = byStage.get(stage);
    return { stage, n: r?.n ?? 0, value: Number(r?.value ?? 0) };
  });
  const maxN = Math.max(1, ...pipeline.map((p) => p.n));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overzicht van de pijplijn, facturen en activiteit"
        actions={<LinkButton href="/contacts/new">Nieuw contact</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Contacten" value={contactsTotal.n} />
        <StatTile label="Open deals" value={openDeals.n} hint="lopende projecten" />
        <StatTile label="Pijplijnwaarde" value={formatEUR(openDeals.value)} />
        <StatTile label="Omzet deze maand" value={formatEUR(docAgg.revenueMonth)} hint="betaalde facturen" />
        <StatTile label="Openstaande facturen" value={docAgg.outstandingN} hint={formatEUR(docAgg.outstandingV)} />
        <StatTile label="Vervallen facturen" value={docAgg.overdueN} hint={formatEUR(docAgg.overdueV)} />
        <StatTile label="Inkooporders onderweg" value={openPurchaseOrders.length} hint="aankomende voorraad" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pijplijn</CardTitle>
          <Link href="/deals" className="text-xs text-accent hover:underline">
            Naar deals
          </Link>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {pipeline.map((p) => (
            <div key={p.stage} className="flex items-center gap-3">
              <span className="w-36 shrink-0">
                <Badge tone={dealStageMeta[p.stage].tone}>{dealStageMeta[p.stage].label}</Badge>
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-background">
                <div
                  className="h-full rounded bg-accent/70"
                  style={{ width: `${Math.max(p.n > 0 ? 6 : 0, (p.n / maxN) * 100)}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm tabular-nums">{p.n}</span>
              <span className="w-28 shrink-0 text-right text-sm tabular-nums text-muted">
                {p.value > 0 ? formatEUR(p.value) : ""}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {openPurchaseOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Inkooporders onderweg</CardTitle>
            <Link href="/inkooporders" className="text-xs text-accent hover:underline">
              Alle inkooporders
            </Link>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th>Verwacht</Th>
                <Th className="text-right">Regels</Th>
                <Th className="text-right">Totaal</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {openPurchaseOrders.map((po) => (
                <Tr key={po.id}>
                  <Td>
                    <Link href={`/inkooporders/${po.id}`} className="font-medium hover:underline">
                      {po.supplier}
                    </Link>
                  </Td>
                  <Td className="text-muted">{po.reference ?? "—"}</Td>
                  <Td className="text-muted">
                    {po.expectedDate
                      ? new Date(po.expectedDate).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{po.items?.length ?? 0}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                  <Td>
                    <Badge tone={PO_STATUS_META[po.status].tone}>{PO_STATUS_META[po.status].label}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recente activiteit</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState title="Nog geen activiteit" />
            ) : (
              <ol className="space-y-3">
                {recentActivity.map((a) => {
                  const link = a.document
                    ? { href: `/documents/${a.document.id}`, label: `${documentKindMeta[a.document.kind]} ${a.document.docNumber ?? ""}`.trim() }
                    : a.deal
                      ? { href: `/deals/${a.deal.id}`, label: a.deal.title }
                      : a.contact
                        ? { href: `/contacts/${a.contact.id}`, label: a.contact.name }
                        : null;
                  return (
                    <li key={a.id} className="border-l-2 border-border pl-3">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="font-medium uppercase tracking-wide">
                          {ACTIVITY_LABEL[a.type] ?? a.type}
                        </span>
                        <span>·</span>
                        <span>{formatDate(a.createdAt)}</span>
                        {a.author?.name && (
                          <>
                            <span>·</span>
                            <span>{a.author.name}</span>
                          </>
                        )}
                        {link && (
                          <>
                            <span>·</span>
                            <Link href={link.href} className="text-accent hover:underline">
                              {link.label}
                            </Link>
                          </>
                        )}
                      </div>
                      {a.subject && <p className="text-sm font-medium">{a.subject}</p>}
                      {a.body && (
                        <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
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
                      <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
                        {d.title}
                      </Link>
                      {d.contact?.name && (
                        <span className="block text-xs text-muted">{d.contact.name}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={dealStageMeta[d.stage].tone}>{dealStageMeta[d.stage].label}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{formatEUR(d.valueEur)}</Td>
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
