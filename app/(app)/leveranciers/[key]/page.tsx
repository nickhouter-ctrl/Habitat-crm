/**
 * Alles van één leverancier of bouwer bij elkaar: facturen, wat er nog
 * openstaat, op welke werven het geboekt is en — bij eigen ploeg — de uren.
 *
 * De sleutel is de genormaliseerde naam (kleine letters, geen leestekens), zodat
 * "Ahmed Bouzekri", "ahmed bouzekri" en "Ahmed Bouzekri (Construcciones Ahmed
 * Javea)" op één kaart landen. Zou dit op naam matchen, dan zag je drie kwart
 * van de facturen niet.
 */
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { SUPPLIER_KEY_SQL } from "@/lib/supplier-key";
import { overheadSuppliers } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";

type Factuur = {
  id: string;
  supplier: string;
  reference: string | null;
  order_date: string | null;
  ex_btw: string | null;
  total: string | null;
  status: string;
  count_as_labor: boolean;
  project_id: string | null;
  project_naam: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [r] = await db.execute<{ naam: string }>(sql`
    select (array_agg(supplier order by length(supplier) desc))[1] as naam
    from purchase_orders
    where ${sql.raw(SUPPLIER_KEY_SQL("supplier"))} = ${key}`);
  return { title: r?.naam ?? "Leverancier" };
}

export default async function LeverancierPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  const facturen = await db.execute<Factuur>(sql`
    select po.id, po.supplier, po.reference, po.order_date::text, po.status,
           coalesce(nullif(po.subtotal, 0),
                    case when coalesce(po.tax, 0) <> 0 then round(po.total - po.tax, 2) else po.total end,
                    0)::text as ex_btw,
           po.total::text, po.count_as_labor,
           po.project_id, p.name as project_naam
    from purchase_orders po
    left join projects p on p.id = po.project_id
    where ${sql.raw(SUPPLIER_KEY_SQL("po.supplier"))} = ${key}
    order by po.order_date desc nulls last, po.created_at desc`);

  if (facturen.length === 0) notFound();

  const naam = facturen.reduce((a, b) => (b.supplier.length > a.length ? b.supplier : a), facturen[0].supplier);

  const [uren] = await db.execute<{ uren: string; kosten: string; werven: number }>(sql`
    select coalesce(sum(t.hours), 0)::text as uren,
           coalesce(sum(t.hours * t.hourly_cost_eur), 0)::text as kosten,
           count(distinct t.project_id)::int as werven
    from time_entries t
    where ${sql.raw(SUPPLIER_KEY_SQL("coalesce(t.worker_name, '')"))} = ${key}`);

  const perProject = await db.execute<{ project_id: string | null; naam: string | null; bedrag: string; n: number }>(sql`
    select po.project_id, p.name as naam,
           round(sum(coalesce(nullif(po.subtotal, 0),
                     case when coalesce(po.tax, 0) <> 0 then round(po.total - po.tax, 2) else po.total end,
                     0))::numeric, 2)::text as bedrag,
           count(*)::int as n
    from purchase_orders po
    left join projects p on p.id = po.project_id
    where ${sql.raw(SUPPLIER_KEY_SQL("po.supplier"))} = ${key}
    group by 1, 2 order by 3 desc`);

  const vasteLast = await db.query.overheadSuppliers.findFirst({
    where: eq(overheadSuppliers.supplierKey, key),
    columns: { id: true, note: true },
  });

  const totaalEx = facturen.reduce((s, f) => s + Number(f.ex_btw ?? 0), 0);
  const gewerkteUren = Number(uren?.uren ?? 0);

  // Hoort deze partij bij de eigen ploeg? Dan staat zijn hele verhaal — uren,
  // werven, tarieven — op zijn ploegpagina; hier alleen een verwijzing.
  const [ploegkaart] = await db.execute<{ id: string; name: string }>(sql`
    select id, name from workers where ${sql.raw(SUPPLIER_KEY_SQL("name"))} = ${key} limit 1`);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {naam}
            {gewerkteUren > 0 && <Badge tone="accent">eigen ploeg</Badge>}
            {vasteLast && <Badge tone="neutral">vaste last{vasteLast.note ? ` · ${vasteLast.note}` : ""}</Badge>}
          </span>
        }
        subtitle={`${facturen.length} ${facturen.length === 1 ? "factuur" : "facturen"} in de administratie`}
        actions={
          <LinkButton href="/leveranciers" variant="ghost">
            ← Alle leveranciers
          </LinkButton>
        }
      />

      {ploegkaart && (
        <Card className="mb-5">
          <CardContent className="py-3 text-sm">
            {ploegkaart.name} hoort bij de eigen ploeg.{" "}
            <Link href={`/ploeg/${ploegkaart.id}`} className="text-accent hover:underline">
              Naar zijn ploegpagina
            </Link>{" "}
            <span className="text-muted">— daar staan zijn uren per werf, zijn tarieven en zijn facturen bij elkaar.</span>
          </CardContent>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Ingekocht (ex. btw)" value={formatEUR(totaalEx)} />
        <StatTile
          label="Uren geboekt"
          value={gewerkteUren > 0 ? gewerkteUren.toLocaleString("nl-NL") : "—"}
          hint={gewerkteUren > 0 ? `${formatEUR(Number(uren?.kosten ?? 0))} arbeidskost` : "geen urenregels"}
        />
        <StatTile label="Werven" value={perProject.filter((p) => p.project_id).length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Facturen</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <Th>Referentie</Th>
                <Th>Datum</Th>
                <Th>Project</Th>
                <Th className="text-right">Ex. btw</Th>
              </tr>
            </THead>
            <TBody>
              {facturen.map((f) => (
                <Tr key={f.id}>
                  <Td>
                    <Link href={`/inkooporders/${f.id}`} className="font-medium hover:underline">
                      {f.reference ?? "—"}
                    </Link>
                    {f.count_as_labor && <span className="block text-xs text-muted">geboekt als uren</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {f.order_date
                      ? new Date(f.order_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </Td>
                  <Td>
                    {f.project_id ? (
                      <Link href={`/projects/${f.project_id}`} className="hover:underline">
                        {f.project_naam}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{formatEUR(Number(f.ex_btw ?? 0))}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verdeeld over werven</CardTitle>
            <span className="text-xs text-muted">waar het geld naartoe ging</span>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {perProject.map((p) => (
              <div key={p.project_id ?? "geen"} className="flex items-baseline justify-between gap-3">
                <span>
                  {p.project_id ? (
                    <Link href={`/projects/${p.project_id}`} className="hover:underline">
                      {p.naam}
                    </Link>
                  ) : (
                    <span className="text-muted">geen project</span>
                  )}
                  <span className="ml-1 text-xs text-muted">({p.n})</span>
                </span>
                <span className="tabular-nums">{formatEUR(Number(p.bedrag))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
