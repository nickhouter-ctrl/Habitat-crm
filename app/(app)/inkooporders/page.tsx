import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  EmptyState,
  Input,
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
import { SorteerbareKop } from "@/components/sorteerbare-kop";
import { db } from "@/lib/db";
import { emailInbox, mailAttachments, projects, purchaseInvoiceReviews, purchaseOrders } from "@/lib/db/schema";
import { formatMoney, poExVat, poExVatAmount, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { cn, formatEUR } from "@/lib/utils";

import { SyncHoldedButton } from "./sync-holded-button";

export const metadata = { title: "Inkooporders" };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_FILTERS = [
  { key: "", label: "Alle" },
  { key: "ordered", label: "Besteld" },
  { key: "in_transit", label: "Onderweg" },
  { key: "received", label: "Ontvangen" },
  { key: "draft", label: "Concept" },
  { key: "cancelled", label: "Geannuleerd" },
] as const;

const PAY_FILTERS = [
  { key: "", label: "Alle" },
  { key: "open", label: "Openstaand" },
  { key: "deels", label: "Deels betaald" },
  { key: "betaald", label: "Betaald" },
] as const;

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();
  const statusFilter = typeof params.status === "string" ? params.status : "";
  const payFilter = typeof params.pay === "string" ? params.pay : "";

  const rows = await db
    .select()
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
    .limit(2000);

  // Naam van het gekoppelde project erbij: in de lijst wil je zien wáár een
  // inkoop op geboekt is zonder elke regel te openen.
  const projectNamen = new Map(
    (await db.select({ id: projects.id, name: projects.name }).from(projects)).map((p) => [p.id, p.name]),
  );

  const pendingHolded = rows.filter((r) => !r.holdedId).length;

  // Facturen die op goedkeuring wachten. Die staan NIET in purchase_orders — pas
  // na goedkeuring ontstaat daar een rij.
  const [{ n: queueCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchaseInvoiceReviews)
    .where(eq(purchaseInvoiceReviews.status, "pending"));

  // Aggregaten op de VOLLEDIGE set (overzicht blijft stabiel los van het filter).
  const eurRows = rows.filter((r) => (r.currency ?? "EUR") === "EUR");
  const sumEx = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + poExVatAmount(r), 0);
  const sumIncl = (rs: typeof eurRows) =>
    rs.filter((r) => r.status !== "draft").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const totalEurEx = sumEx(eurRows);
  const totalEurIncl = sumIncl(eurRows);
  const open = rows.filter((r) => PO_OPEN_STATUSES.includes(r.status));
  const received = rows.filter((r) => r.status === "received");
  const drafts = rows.filter((r) => r.status === "draft");
  const isFullyPaid = (r: (typeof rows)[number]) =>
    !!r.paidAt || (Number(r.total ?? 0) > 0 && Number(r.paidEur ?? 0) >= Number(r.total ?? 0) - 0.01);
  const unpaid = rows.filter((r) => r.status !== "draft" && !isFullyPaid(r));
  const unpaidTotal = unpaid
    .filter((r) => (r.currency ?? "EUR") === "EUR")
    .reduce((s, r) => s + (Number(r.total ?? 0) - Number(r.paidEur ?? 0)), 0);
  const nonEur = rows.filter((r) => (r.currency ?? "EUR") !== "EUR");

  // Betaalstatus per regel (voor filter + badge).
  const payState = (r: (typeof rows)[number]): "concept" | "betaald" | "deels" | "open" => {
    if (r.status === "draft") return "concept";
    if (isFullyPaid(r)) return "betaald";
    return Number(r.paidEur ?? 0) > 0 ? "deels" : "open";
  };

  // Zoeken/filteren in JS (lijst is klein, en zo blijven de aggregaten stabiel).
  const needle = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (payFilter && payState(r) !== payFilter) return false;
    if (needle) {
      const hay = `${r.supplier} ${r.reference ?? ""} ${r.containerRef ?? ""} ${r.shipmentRef ?? ""} ${r.notes ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  /**
   * Sorteren gebeurt hier in JavaScript en niet in SQL — anders dan bij de
   * documentenlijst, met opzet. De hele set staat al in het geheugen (de
   * totalen hierboven worden over álles berekend, los van het filter), en twee
   * kolommen bestaan niet als databasekolom: "Ex. BTW" komt uit `poExVat()`
   * (subtotaal, of totaal − btw, of totaal) en "Regels" is het aantal
   * factuurregels. Die in SQL sorteren zou die logica moeten dupliceren.
   */
  const sorteerbaar = {
    supplier: (r: (typeof rows)[number]) => r.supplier.toLowerCase(),
    reference: (r: (typeof rows)[number]) => (r.reference ?? "").toLowerCase(),
    project: (r: (typeof rows)[number]) => (r.projectId ? (projectNamen.get(r.projectId) ?? "") : "").toLowerCase(),
    orderDate: (r: (typeof rows)[number]) => r.orderDate ?? "",
    expectedDate: (r: (typeof rows)[number]) => r.expectedDate ?? "",
    regels: (r: (typeof rows)[number]) => (Array.isArray(r.items) ? r.items.length : 0),
    exVat: (r: (typeof rows)[number]) => poExVatAmount(r),
    total: (r: (typeof rows)[number]) => Number(r.total ?? 0),
    status: (r: (typeof rows)[number]) => r.status,
    betaald: (r: (typeof rows)[number]) => Number(r.paidEur ?? 0),
  } as const;
  type SorteerSleutel = keyof typeof sorteerbaar;

  const gevraagd = typeof params.sort === "string" ? params.sort : "";
  const sorteerOp = (gevraagd in sorteerbaar ? gevraagd : null) as SorteerSleutel | null;
  const oplopend = params.dir === "asc";

  const gesorteerd = sorteerOp
    ? [...filtered].sort((a, b) => {
        const x = sorteerbaar[sorteerOp](a);
        const y = sorteerbaar[sorteerOp](b);
        // Lege waarden altijd onderaan, ongeacht de richting — een rij zonder
        // datum bovenaan zetten helpt niemand bij het zoeken.
        const aLeeg = x === "" || x == null;
        const bLeeg = y === "" || y == null;
        if (aLeeg !== bLeeg) return aLeeg ? 1 : -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "nl");
        return oplopend ? c : -c;
      })
    : filtered;

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = {
      q,
      status: statusFilter,
      pay: payFilter,
      sort: sorteerOp ?? "",
      dir: sorteerOp ? (oplopend ? "asc" : "desc") : "",
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== "") sp.set(k, v as string);
    }
    const s = sp.toString();
    return s ? `/inkooporders?${s}` : "/inkooporders";
  };

  const SorteerKop = ({
    sleutel,
    children,
    className,
  }: {
    sleutel: SorteerSleutel;
    children: React.ReactNode;
    className?: string;
  }) => (
    <SorteerbareKop
      sleutel={sleutel}
      actief={sorteerOp === sleutel}
      oplopend={oplopend}
      aflopendEerst={["orderDate", "expectedDate", "regels", "exVat", "total", "betaald"].includes(sleutel)}
      href={(s, richting) => buildHref({ sort: s, dir: richting })}
      className={className}
    >
      {children}
    </SorteerbareKop>
  );

  const hasFilter = !!(q || statusFilter || payFilter);

  return (
    <>
      <PageHeader
        title="Inkooporders"
        subtitle={
          `${rows.length} ${rows.length === 1 ? "bestelling/aankoop" : "bestellingen/aankopen"} — incl. aankoopfacturen uit Holded` +
          (nonEur.length ? ` · ${nonEur.length} in vreemde valuta (niet in het totaal)` : "")
        }
        actions={
          <>
            <SyncHoldedButton pendingCount={pendingHolded} />
            {queueCount > 0 && (
              <LinkButton href="/inkooporders/te-verwerken" variant="secondary">
                📥 Te keuren ({queueCount})
              </LinkButton>
            )}
            <LinkButton href="/inkooporders/bestellen" variant="secondary">
              Bijbestellen
            </LinkButton>
            <LinkButton href="/inkooporders/new">Toevoegen</LinkButton>
          </>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Aantal" value={rows.length} hint={drafts.length ? `${drafts.length} concept(en) niet meegeteld` : undefined} />
          <StatTile label="Totaal ex. BTW" value={formatEUR(totalEurEx)} hint="zonder concept" />
          <StatTile label="Totaal incl. BTW" value={formatEUR(totalEurIncl)} hint="zonder concept" />
          <StatTile label="Te betalen" value={formatEUR(unpaidTotal)} hint={`${unpaid.length} openstaand`} tone="danger" />
          <StatTile label="Onderweg" value={open.length} hint={open.length ? formatEUR(sumEx(open.filter((r) => (r.currency ?? "EUR") === "EUR"))) : "—"} tone="info" />
          <StatTile label="Ontvangen / gefactureerd" value={received.length} hint={formatEUR(sumEx(received.filter((r) => (r.currency ?? "EUR") === "EUR")))} tone="success" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen inkooporders"
          description="Voeg een leveranciersbestelling toe (bv. een KKR/Magic Stone proforma) of synchroniseer met Holded om aankoopfacturen op te halen."
          action={<LinkButton href="/inkooporders/new">Toevoegen</LinkButton>}
        />
      ) : (
        <>
          {/* Zoeken & filteren */}
          <div className="mb-4 space-y-3">
            <form action="/inkooporders" className="flex gap-2">
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              {payFilter && <input type="hidden" name="pay" value={payFilter} />}
              {/* Sortering meesturen, anders val je bij het zoeken terug op de
                  standaardvolgorde terwijl de kolomkop nog gesorteerd oogt. */}
              {sorteerOp && <input type="hidden" name="sort" value={sorteerOp} />}
              {sorteerOp && <input type="hidden" name="dir" value={oplopend ? "asc" : "desc"} />}
              <Input
                name="q"
                defaultValue={q}
                placeholder="Zoek op leverancier, referentie/factuurnummer, container…"
                className="max-w-md"
              />
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
                Zoeken
              </button>
              {hasFilter && (
                <LinkButton href="/inkooporders" variant="ghost">
                  Wissen
                </LinkButton>
              )}
            </form>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.key || "all"}
                  href={buildHref({ status: f.key || undefined })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    statusFilter === f.key ? "bg-accent text-white" : "bg-background text-muted hover:bg-border",
                  )}
                >
                  {f.label}
                </Link>
              ))}
              <span className="mx-1 text-border">·</span>
              {PAY_FILTERS.map((f) => (
                <Link
                  key={f.key || "allpay"}
                  href={buildHref({ pay: f.key || undefined })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    payFilter === f.key ? "bg-accent text-white" : "bg-background text-muted hover:bg-border",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            {hasFilter && (
              <p className="text-xs text-muted">
                {filtered.length} van {rows.length} inkooporders
              </p>
            )}
          </div>

          <Card className="overflow-hidden">
            <Table>
              <THead>
                <tr>
                  <SorteerKop sleutel="supplier">Leverancier</SorteerKop>
                  <SorteerKop sleutel="reference">Referentie</SorteerKop>
                  <SorteerKop sleutel="project">Project</SorteerKop>
                  <SorteerKop sleutel="orderDate">Datum</SorteerKop>
                  <SorteerKop sleutel="expectedDate">Verwacht</SorteerKop>
                  <SorteerKop sleutel="regels" className="text-right">Regels</SorteerKop>
                  <SorteerKop sleutel="exVat" className="text-right">Ex. BTW</SorteerKop>
                  <SorteerKop sleutel="total" className="text-right">Incl. BTW</SorteerKop>
                  <SorteerKop sleutel="status">Status</SorteerKop>
                  <SorteerKop sleutel="betaald">Betaald</SorteerKop>
                </tr>
              </THead>
              <TBody>
                {filtered.length === 0 ? (
                  <Tr>
                    <Td className="text-muted" colSpan={10}>
                      Geen inkooporders gevonden voor deze zoekopdracht/filter.
                    </Td>
                  </Tr>
                ) : (
                  gesorteerd.map((po) => {
                    const meta = PO_STATUS_META[po.status];
                    const ps = payState(po);
                    const pay =
                      ps === "concept"
                        ? null
                        : ps === "betaald"
                          ? { tone: "success" as const, label: "Betaald" }
                          : ps === "deels"
                            ? { tone: "warning" as const, label: "Deels" }
                            : { tone: "danger" as const, label: "Openstaand" };
                    return (
                      <Tr key={po.id}>
                        <Td className="font-medium">
                          <Link href={`/inkooporders/${po.id}`} className="hover:underline">
                            {po.supplier}
                          </Link>
                          {po.kind === "invoice" && (
                            <Badge tone="neutral" className="ml-2">
                              factuur
                            </Badge>
                          )}
                          {po.suggestedKind && !po.projectId && (
                            <Badge tone="accent" className="ml-2">
                              voorstel: {po.suggestedKind === "labor" ? "uren" : "materiaal"}
                            </Badge>
                          )}
                        </Td>
                        <Td className="text-muted">{po.reference ?? "—"}</Td>
                        <Td>
                          {po.projectId ? (
                            <Link
                              href={`/projects/${po.projectId}`}
                              className="hover:underline"
                              title={po.countAsLabor ? "geboekt als uren/arbeid" : "geboekt als materiaalkost"}
                            >
                              {projectNamen.get(po.projectId) ?? "—"}
                              {po.countAsLabor && <span className="block text-xs text-muted">uren</span>}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </Td>
                        <Td className="text-muted">{fmtDate(po.orderDate)}</Td>
                        <Td className="text-muted">{fmtDate(po.expectedDate)}</Td>
                        <Td className="text-right tabular-nums text-muted">{po.items?.length ?? 0}</Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(poExVatAmount(po), po.currency)}
                          {poExVat(po).vatUnknown && (
                            <span
                              className="ml-1 cursor-help text-xs text-warning"
                              title="Geen btw/subtotaal op deze inkooporder — dit is het factuurtotaal en zit er dus mogelijk incl. btw in."
                            >
                              btw?
                            </span>
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                        <Td>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </Td>
                        <Td>
                          {pay ? <Badge tone={pay.tone}>{pay.label}</Badge> : <span className="text-muted">—</span>}
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
