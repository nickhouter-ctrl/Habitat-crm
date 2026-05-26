import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { activities, contacts, deals, documents, emailInbox, mailAttachments, products, purchaseOrders, quoteRequests } from "@/lib/db/schema";
import { purchaseDocsTotalExBTW } from "@/lib/holded/accounting";
import { formatMoney, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { formatDate, formatEUR } from "@/lib/utils";
import { dealStageMeta, documentKindMeta } from "./_meta";
import { approveProforma, markPurchaseOrderPaid } from "./inkooporders/actions";

export const metadata = { title: "Dashboard" };
// Cold start mag tot 60s, ruim voor de eerste Holded-fetch; warm is dit 1–2s.
export const maxDuration = 60;

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

  const [[contactsTotal], pipelineRows, [docAgg], [creditAgg], [purchaseAgg], [productsAgg], openPurchaseOrders, recentDeals, recentActivity, holdedExpensesYTD, [openRequestsAgg], [invoiceReviewAgg], unpaidInvoices, proformas] =
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
          // Ex BTW: omzet = subtotaal van facturen
          revenueMonth: sql<string>`coalesce(sum(case when ${documents.issueDate} >= ${monthStart} then ${documents.subtotalEur} else 0 end), 0)`,
          revenueAll: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
          // Openstaand/vervallen blijft cash-flow (incl. BTW), dat is wat klant betaalt.
          outstandingN: sql<number>`count(case when ${openExpr} then 1 end)::int`,
          outstandingV: sql<string>`coalesce(sum(case when ${openExpr} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
          overdueN: sql<number>`count(case when ${openExpr} and ${documents.dueDate} < ${today} then 1 end)::int`,
          overdueV: sql<string>`coalesce(sum(case when ${openExpr} and ${documents.dueDate} < ${today} then ${documents.totalEur} - ${documents.paidEur} else 0 end), 0)`,
        })
        .from(documents)
        .where(eq(documents.kind, "invoice")),
      // Credit notes to subtract from revenue (ex BTW).
      db
        .select({
          paidAll: sql<string>`coalesce(sum(${documents.subtotalEur}), 0)`,
          revenueMonth: sql<string>`coalesce(sum(case when ${documents.issueDate} >= ${monthStart} then ${documents.subtotalEur} else 0 end), 0)`,
        })
        .from(documents)
        .where(eq(documents.kind, "creditnote")),
      // Lokale PO's die nog niet in Holded staan — die zijn al "besteld + betaald"
      // maar zitten nog niet in de Holded-aankoopfacturen, dus tellen we los bij op.
      db
        .select({
          n: count(),
          totalEur: sql<string>`coalesce(sum(case when ${purchaseOrders.currency} = 'EUR' and ${purchaseOrders.holdedId} is null and ${purchaseOrders.status} not in ('draft', 'cancelled') then coalesce(${purchaseOrders.subtotal}, ${purchaseOrders.total}) else 0 end), 0)`,
        })
        .from(purchaseOrders),
      // Actieve producten zonder barcode + actieve producten onder de drempel.
      db
        .select({
          noBarcode: sql<number>`count(case when ${products.isActive} = true and ${products.barcode} is null then 1 end)::int`,
          lowStock: sql<number>`count(case when ${products.isActive} = true and ${products.stockMin} is not null and coalesce(${products.stockQty}, 0) < ${products.stockMin} then 1 end)::int`,
          stockNoPhoto: sql<number>`count(case when ${products.isActive} = true and ${products.imageUrl} is null then 1 end)::int`,
        })
        .from(products),
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
      purchaseDocsTotalExBTW(),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(quoteRequests)
        .where(eq(quoteRequests.status, "pending")),
      // Inkoopfacturen die handmatige review nodig hebben — mails met financiële
      // bijlages die nog niet aan een PO gelinkt zijn
      db
        .select({
          n: sql<number>`count(distinct ${emailInbox.id})::int`,
        })
        .from(emailInbox)
        .innerJoin(mailAttachments, eq(mailAttachments.emailId, emailInbox.id))
        .where(
          and(
            isNull(emailInbox.linkedPurchaseOrderId),
            sql`${mailAttachments.category} IN ('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor')`,
            sql`${emailInbox.status} != 'archived'`,
          ),
        ),
      // Openstaande inkoopfacturen — nog te betalen (nieuwste eerst)
      db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            isNull(purchaseOrders.paidAt),
            sql`${purchaseOrders.status} not in ('draft', 'cancelled')`,
          ),
        )
        .orderBy(desc(purchaseOrders.createdAt)),
      // Proforma's die op goedkeuring wachten
      db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.status, "draft"))
        .orderBy(desc(purchaseOrders.createdAt)),
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
  const revenueAll = Number(docAgg.revenueAll) - Number(creditAgg.paidAll);
  const revenueMonth = Number(docAgg.revenueMonth) - Number(creditAgg.revenueMonth);
  const unpushedPurchase = Number(purchaseAgg.totalEur);
  const totalPurchase = Number(holdedExpensesYTD) + unpushedPurchase;
  const unpaidPurchaseTotal = unpaidInvoices.reduce((s, p) => s + Number(p.total ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overzicht van de pijplijn, facturen en activiteit"
        actions={<LinkButton href="/contacts/new">Nieuw contact</LinkButton>}
      />

      {((openRequestsAgg?.n ?? 0) > 0 || (invoiceReviewAgg?.n ?? 0) > 0 || productsAgg.noBarcode > 0 || productsAgg.lowStock > 0 || productsAgg.stockNoPhoto > 0 || docAgg.overdueN > 0 || openPurchaseOrders.length > 0 || proformas.length > 0 || unpaidInvoices.length > 0) && (
        <div className="mb-4 space-y-2">
          {proformas.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground">
              <span>
                ✅ <strong>{proformas.length}</strong> proforma{proformas.length === 1 ? "" : "'s"} wacht{proformas.length === 1 ? "" : "en"} op goedkeuring — zie hieronder.
              </span>
            </div>
          )}
          {unpaidInvoices.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
              <span>
                💶 <strong>{unpaidInvoices.length}</strong> inkoopfactu{unpaidInvoices.length === 1 ? "ur" : "ren"} nog te betalen — {formatEUR(unpaidPurchaseTotal)}.
              </span>
            </div>
          )}
          {(openRequestsAgg?.n ?? 0) > 0 && (
            <Link
              href="/aanvragen?status=pending"
              className="flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-accent/15"
            >
              <span>
                📩 <strong>{openRequestsAgg!.n}</strong> open offerte-aanvra{openRequestsAgg!.n === 1 ? "ag" : "gen"} via de website — even bekijken en accepteren/afwijzen.
              </span>
              <span className="font-medium text-accent">Naar inbox →</span>
            </Link>
          )}
          {(invoiceReviewAgg?.n ?? 0) > 0 && (
            <Link
              href="/inbox?status=new"
              className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-warning/15"
            >
              <span>
                🧾 <strong>{invoiceReviewAgg!.n}</strong> mail{invoiceReviewAgg!.n === 1 ? "" : "s"} met factuurbijlage{invoiceReviewAgg!.n === 1 ? "" : "n"} wacht{invoiceReviewAgg!.n === 1 ? "" : "en"} op review — automatische inkoopfactuur kon niet aangemaakt worden (bedrag of leverancier onbekend).
              </span>
              <span className="font-medium text-warning">Bekijk →</span>
            </Link>
          )}
          {productsAgg.stockNoPhoto > 0 && (
            <Link
              href="/products?nofoto=1"
              className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-warning/15"
            >
              <span>
                📸 <strong>{productsAgg.stockNoPhoto}</strong> actieve producten zonder foto — vul aan en push naar de website.
              </span>
              <span className="font-medium text-warning">Bekijk →</span>
            </Link>
          )}
          {productsAgg.lowStock > 0 && (
            <Link
              href="/products?lowstock=1"
              className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-danger/15"
            >
              <span>
                🔻 <strong>{productsAgg.lowStock}</strong> producten staan onder de voorraaddrempel — bijbestellen voordat het op is.
              </span>
              <span className="font-medium text-danger">Bekijk →</span>
            </Link>
          )}
          {docAgg.overdueN > 0 && (
            <Link
              href="/invoices"
              className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-danger/15"
            >
              <span>
                ⏰ <strong>{docAgg.overdueN}</strong> factu{docAgg.overdueN === 1 ? "ur is" : "ren zijn"} vervallen ({formatEUR(docAgg.overdueV)} openstaand) — verstuur herinnering.
              </span>
              <span className="font-medium text-danger">Open facturen →</span>
            </Link>
          )}
          {(() => {
            const soon = openPurchaseOrders.filter((po) => {
              if (!po.expectedDate) return false;
              const d = new Date(po.expectedDate).getTime();
              const diff = (d - Date.now()) / (1000 * 60 * 60 * 24);
              return diff <= 7 && diff >= -1;
            });
            return soon.length > 0 ? (
              <Link
                href="/inkooporders"
                className="flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-accent/15"
              >
                <span>
                  📦 <strong>{soon.length}</strong> inkooporder{soon.length === 1 ? "" : "s"} komen deze week binnen — voorraad klaarzetten.
                </span>
                <span className="font-medium text-accent">Open inkooporders →</span>
              </Link>
            ) : null;
          })()}
          {productsAgg.noBarcode > 0 && (
            <Link
              href="/products?nobarcode=1"
              className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-warning/15"
            >
              <span>
                🏷️ <strong>{productsAgg.noBarcode}</strong> producten hebben nog geen barcode — labels kunnen niet geprint worden.
              </span>
              <span className="font-medium text-warning">Bekijk →</span>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Totale omzet" value={formatEUR(revenueAll)} hint="ex. BTW · facturen − creditnota's" />
        <StatTile
          label="Totale inkoop"
          value={formatEUR(totalPurchase)}
          hint={
            unpushedPurchase > 0
              ? `ex. BTW · Holded ${formatEUR(holdedExpensesYTD)} + ${purchaseAgg.n} nog-niet-gepushte PO's`
              : "ex. BTW · uit Holded aankoopfacturen"
          }
        />
        <StatTile label="Omzet deze maand" value={formatEUR(revenueMonth)} hint="ex. BTW" />
        <StatTile label="Openstaande facturen" value={docAgg.outstandingN} hint={formatEUR(docAgg.outstandingV)} />
        <StatTile label="Vervallen facturen" value={docAgg.overdueN} hint={formatEUR(docAgg.overdueV)} />
        <StatTile label="Pijplijnwaarde" value={formatEUR(openDeals.value)} hint={`${openDeals.n} open deals`} />
        <StatTile label="Inkooporders onderweg" value={openPurchaseOrders.length} hint="aankomende voorraad" />
        <StatTile label="Te betalen (inkoop)" value={unpaidInvoices.length} hint={formatEUR(unpaidPurchaseTotal)} />
        <StatTile label="Contacten" value={contactsTotal.n} />
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

      {proformas.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Proforma&apos;s ter goedkeuring</CardTitle>
            <Link href="/inkooporders" className="text-xs text-accent hover:underline">
              Alle inkooporders
            </Link>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th className="text-right">Bedrag</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {proformas.map((po) => (
                <Tr key={po.id}>
                  <Td>
                    <Link href={`/inkooporders/${po.id}`} className="font-medium hover:underline">
                      {po.supplier}
                    </Link>
                  </Td>
                  <Td className="text-muted">{po.reference ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                  <Td className="text-right">
                    <form
                      action={async () => {
                        "use server";
                        await approveProforma(po.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                      >
                        Goedkeuren
                      </button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Openstaande inkoopfacturen</CardTitle>
          <Link href="/inkooporders" className="text-xs text-accent hover:underline">
            Alle inkooporders
          </Link>
        </CardHeader>
        {unpaidInvoices.length === 0 ? (
          <CardContent>
            <EmptyState title="Alles betaald ✓" description="Geen openstaande inkoopfacturen." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Leverancier</Th>
                <Th>Referentie</Th>
                <Th>Vervaldatum</Th>
                <Th className="text-right">Bedrag</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {unpaidInvoices.map((po) => {
                const overdue = !!po.dueDate && po.dueDate < today;
                return (
                  <Tr key={po.id}>
                    <Td>
                      <Link href={`/inkooporders/${po.id}`} className="font-medium hover:underline">
                        {po.supplier}
                      </Link>
                    </Td>
                    <Td className="text-muted">{po.reference ?? "—"}</Td>
                    <Td className={overdue ? "font-medium text-danger" : "text-muted"}>
                      {po.dueDate ? formatDate(po.dueDate) : "—"}
                      {overdue ? " · vervallen" : ""}
                    </Td>
                    <Td className="text-right font-medium tabular-nums">
                      {formatMoney(po.total, po.currency)}
                    </Td>
                    <Td className="text-right">
                      <form
                        action={async () => {
                          "use server";
                          await markPurchaseOrderPaid(po.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
                        >
                          Betaald
                        </button>
                      </form>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

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
