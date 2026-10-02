import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
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
import {
  emailInbox,
  mailAttachments,
  overheadSuppliers,
  overheadSupplierKey,
  projects,
  purchaseInvoiceReviews,
  purchaseOrders,
} from "@/lib/db/schema";
import { verdelingPerInkoop, type InkoopDeel } from "@/lib/inkoop-verdeling";
import { formatMoney, poExVat, poExVatAmount, PO_OPEN_STATUSES, PO_STATUS_META } from "@/lib/purchase-orders";
import { cn, formatEUR } from "@/lib/utils";


export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Inkooporders") };
}

const fmtDate = (d: string | null, uiDateLocale = "nl-NL") =>
  d ? new Date(d).toLocaleDateString(uiDateLocale, { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_FILTERS = [
  { key: "", label: "Alle" },
  { key: "ordered", label: "Besteld" },
  { key: "in_transit", label: "Onderweg" },
  { key: "received", label: "Ontvangen" },
  { key: "draft", label: "Concept" },
  { key: "cancelled", label: "Geannuleerd" },
] as const;

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();
  const statusFilter = typeof params.status === "string" ? params.status : "";

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

  // Facturen die over meerdere werven zijn verdeeld hebben zelf geen project —
  // hun koppeling zit in de uren- en kostenregels. Zonder dit toonde de kolom
  // "—" bij precies de facturen die het zorgvuldigst waren uitgesplitst.
  const verdelingen = await verdelingPerInkoop(
    rows.filter((r) => r.projectId == null).map((r) => r.id),
  );

  // Leveranciers die als algemene kosten zijn aangemerkt (stroom, telefoon,
  // verzekering) horen bij géén werf. Die mogen dus niet als "nog geen project"
  // opgemerkt worden, anders wordt die waarschuwing meubilair en kijkt niemand
  // er meer naar.
  const algemeneKosten = new Set(
    (await db.select({ key: overheadSuppliers.supplierKey }).from(overheadSuppliers)).map((r) => r.key),
  );

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
  const nonEur = rows.filter((r) => (r.currency ?? "EUR") !== "EUR");

  // Zoeken/filteren in JS (lijst is klein, en zo blijven de aggregaten stabiel).
  const needle = q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
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
    project: (r: (typeof rows)[number]) =>
      (r.projectId
        ? (projectNamen.get(r.projectId) ?? "")
        : (verdelingen.get(r.id) ?? []).map((d) => d.projectNaam ?? "").join(" ")
      ).toLowerCase(),
    orderDate: (r: (typeof rows)[number]) => r.orderDate ?? "",
    expectedDate: (r: (typeof rows)[number]) => r.expectedDate ?? "",
    regels: (r: (typeof rows)[number]) => (Array.isArray(r.items) ? r.items.length : 0),
    exVat: (r: (typeof rows)[number]) => poExVatAmount(r),
    total: (r: (typeof rows)[number]) => Number(r.total ?? 0),
    status: (r: (typeof rows)[number]) => r.status,
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
      aflopendEerst={["orderDate", "expectedDate", "regels", "exVat", "total"].includes(sleutel)}
      href={(s, richting) => buildHref({ sort: s, dir: richting })}
      className={className}
    >
      {children}
    </SorteerbareKop>
  );

  const hasFilter = !!(q || statusFilter);

  return (
    <>
      <PageHeader
        title={uiT("Inkooporders")}
        subtitle={
          `${rows.length} ${rows.length === 1 ? "bestelling/aankoop" : "bestellingen/aankopen"} — overzicht per project; betaalstatus zie je in Holded` +
          (nonEur.length ? ` · ${nonEur.length} in vreemde valuta (niet in het totaal)` : "")
        }
        actions={
          <>
            {queueCount > 0 && (
              <LinkButton href="/inkooporders/te-verwerken" variant="secondary">
                {uiT("📥 Te keuren (")}{queueCount})
              </LinkButton>
            )}
            <LinkButton href="/inkooporders/bestellen" variant="secondary">
              {uiT("Bijbestellen")} </LinkButton>
            <LinkButton href="/inkooporders/new">{uiT("Toevoegen")}</LinkButton>
          </>
        }
      />

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label={uiT("Aantal")} value={rows.length} hint={drafts.length ? uiT("{v0} concept(en) niet meegeteld", { v0: drafts.length }) : undefined} />
          <StatTile label={uiT("Totaal ex. BTW")} value={formatEUR(totalEurEx)} hint={uiT("zonder concept")} />
          <StatTile label={uiT("Totaal incl. BTW")} value={formatEUR(totalEurIncl)} hint={uiT("zonder concept")} />
          <StatTile label={uiT("Onderweg")} value={open.length} hint={open.length ? formatEUR(sumEx(open.filter((r) => (r.currency ?? "EUR") === "EUR"))) : "—"} tone="info" />
          <StatTile label={uiT("Ontvangen / gefactureerd")} value={received.length} hint={formatEUR(sumEx(received.filter((r) => (r.currency ?? "EUR") === "EUR")))} tone="success" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={uiT("Nog geen inkooporders")}
          description={uiT("Voeg een leveranciersbestelling toe (bv. een KKR/Magic Stone proforma) — inkoopfacturen uit de mail verschijnen hier na goedkeuring.")}
          action={<LinkButton href="/inkooporders/new">{uiT("Toevoegen")}</LinkButton>}
        />
      ) : (
        <>
          {/* Zoeken & filteren */}
          <div className="mb-4 space-y-3">
            <form action="/inkooporders" className="flex gap-2">
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              {/* Sortering meesturen, anders val je bij het zoeken terug op de
                  standaardvolgorde terwijl de kolomkop nog gesorteerd oogt. */}
              {sorteerOp && <input type="hidden" name="sort" value={sorteerOp} />}
              {sorteerOp && <input type="hidden" name="dir" value={oplopend ? "asc" : "desc"} />}
              <Input
                name="q"
                defaultValue={q}
                placeholder={uiT("Zoek op leverancier, referentie/factuurnummer, container…")}
                className="max-w-md"
              />
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">
                {uiT("Zoeken")} </button>
              {hasFilter && (
                <LinkButton href="/inkooporders" variant="ghost">
                  {uiT("Wissen")} </LinkButton>
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
                  {uiT(f.label)}
                </Link>
              ))}
            </div>
            {hasFilter && (
              <p className="text-xs text-muted">
                {filtered.length} {uiT("van")} {rows.length} {uiT("inkooporders")} </p>
            )}
          </div>

          <Card className="overflow-hidden">
            <Table>
              <THead>
                <tr>
                  <SorteerKop sleutel="supplier">{uiT("Leverancier")}</SorteerKop>
                  <SorteerKop sleutel="reference">{uiT("Referentie")}</SorteerKop>
                  <SorteerKop sleutel="project">{uiT("Project")}</SorteerKop>
                  <SorteerKop sleutel="orderDate">{uiT("Datum")}</SorteerKop>
                  <SorteerKop sleutel="expectedDate">{uiT("Verwacht")}</SorteerKop>
                  <SorteerKop sleutel="regels" className="text-right">{uiT("Regels")}</SorteerKop>
                  <SorteerKop sleutel="exVat" className="text-right">{uiT("Ex. BTW")}</SorteerKop>
                  <SorteerKop sleutel="total" className="text-right">{uiT("Incl. BTW")}</SorteerKop>
                  <SorteerKop sleutel="status">{uiT("Status")}</SorteerKop>
                </tr>
              </THead>
              <TBody>
                {filtered.length === 0 ? (
                  <Tr>
                    <Td className="text-muted" colSpan={9}>
                      {uiT("Geen inkooporders gevonden voor deze zoekopdracht/filter.")} </Td>
                  </Tr>
                ) : (
                  gesorteerd.map((po) => {
                    const meta = PO_STATUS_META[po.status];
                    return (
                      <Tr key={po.id}>
                        <Td className="font-medium">
                          <Link href={`/inkooporders/${po.id}`} className="hover:underline">
                            {po.supplier}
                          </Link>
                          {po.kind === "invoice" && (
                            <Badge tone="neutral" className="ml-2">
                              {uiT("factuur")} </Badge>
                          )}
                          {po.suggestedKind && !po.projectId && (
                            <Badge tone="accent" className="ml-2">
                              {uiT("voorstel:")} {po.suggestedKind === "labor" ? uiT("uren") : uiT("materiaal")}
                            </Badge>
                          )}
                        </Td>
                        <Td className="text-muted">{po.reference ?? "—"}</Td>
                        <Td>
                          {po.projectId ? (
                            <Link
                              href={`/projects/${po.projectId}`}
                              className="hover:underline"
                              title={po.countAsLabor ? uiT("geboekt als uren/arbeid") : uiT("geboekt als materiaalkost")}
                            >
                              {projectNamen.get(po.projectId) ?? "—"}
                              {po.countAsLabor && <span className="block text-xs text-muted">{uiT("uren")}</span>}
                            </Link>
                          ) : (
                            <ProjectCel
                              deel={verdelingen.get(po.id) ?? []}
                              waarschuw={
                                po.kind === "invoice" && !algemeneKosten.has(overheadSupplierKey(po.supplier))
                              }
                            />
                          )}
                        </Td>
                        <Td className="text-muted">{fmtDate(po.orderDate, uiDateLocale)}</Td>
                        <Td className="text-muted">{fmtDate(po.expectedDate, uiDateLocale)}</Td>
                        <Td className="text-right tabular-nums text-muted">{po.items?.length ?? 0}</Td>
                        <Td className="text-right tabular-nums">
                          {formatMoney(poExVatAmount(po), po.currency)}
                          {poExVat(po).vatUnknown && (
                            <span
                              className="ml-1 cursor-help text-xs text-warning"
                              title={uiT("Geen btw/subtotaal op deze inkooporder — dit is het factuurtotaal en zit er dus mogelijk incl. btw in.")}
                            >
                              {uiT("btw?")} </span>
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">{formatMoney(po.total, po.currency)}</Td>
                        <Td>
                          <Badge tone={meta.tone}>{uiT(meta.label)}</Badge>
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

/**
 * De projectkolom voor een inkoop zonder eigen `project_id`. Drie gevallen, en
 * ze mogen er niet hetzelfde uitzien:
 *
 * - verdeeld over werven → de werven zelf, want dáár staat het geld;
 * - een factuur die nergens landt → een waarschuwing, dit bedrag telt op geen
 *   enkele werf mee (juist die viel eerder weg tussen de streepjes);
 * - een bestelling voor voorraad of een leverancier van algemene kosten → een
 *   streepje, dat hoort zo.
 */
async function ProjectCel({ deel, waarschuw }: { deel: InkoopDeel[]; waarschuw: boolean }) {
  const uiT = await uiTranslation();
  if (deel.length === 0) {
    return waarschuw ? (
      <span title={uiT("Goedgekeurd, maar op geen enkele werf geboekt — deze kost telt nergens mee.")}>
        <Badge tone="warning">{uiT("nog geen project")}</Badge>
      </span>
    ) : (
      <span className="text-xs text-muted">—</span>
    );
  }

  const namen = deel.map((d) => d.projectNaam ?? "zonder project");
  const soorten = [...new Set(deel.map((d) => d.soort))];
  const toon = deel.slice(0, 2);
  return (
    <div title={namen.join(", ")}>
      {toon.map((d, i) => (
        <span key={`${d.soort}-${d.projectId ?? i}`}>
          {i > 0 && <span className="text-muted">, </span>}
          {d.projectId ? (
            <Link href={`/projects/${d.projectId}`} className="hover:underline">
              {d.projectNaam ?? uiT("project")}
            </Link>
          ) : (
            <span className="text-muted">{uiT("zonder project")}</span>
          )}
        </span>
      ))}
      {deel.length > toon.length && (
        <span className="text-muted"> +{deel.length - toon.length}</span>
      )}
      <span className="block text-xs text-muted">
        {deel.length === 1 ? "" : uiT("verdeeld over {v0} werven · ", { v0: deel.length })}
        {soorten.map((s) => (s === "uren" ? "uren" : "materiaal")).join(" + ")}
      </span>
    </div>
  );
}
