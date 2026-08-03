/**
 * Leveranciers & ploeg — één kaart per partij waar we geld aan uitgeven.
 *
 * Bestond nog niet: inkoopfacturen stonden alleen als losse regels in
 * /inkooporders, dus "wat hebben we dit jaar aan Ahmed betaald en staat er nog
 * iets open?" was een zoektocht. Namen worden GENORMALISEERD gegroepeerd, want
 * dezelfde partij komt in verschillende schrijfwijzen binnen: "Ahmed Bouzekri",
 * "ahmed bouzekri" en "Ahmed Bouzekri (Construcciones Ahmed Javea)" zijn samen
 * 17 facturen die anders over drie regels verspreid staan.
 */
import { sql } from "drizzle-orm";
import { Search } from "lucide-react";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  Input,
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
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Leveranciers" };

type Rij = {
  sleutel: string;
  naam: string;
  facturen: number;
  totaal_ex: string | null;
  openstaand: string | null;
  laatste: string | null;
  is_ploeg: boolean;
  is_vaste_last: boolean;
};

export default async function LeveranciersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  // Groeperen op een genormaliseerde naam; de langste schrijfwijze tonen, want
  // die bevat meestal de bedrijfsvorm ("… S.L.").
  const rijen = await db.execute<Rij>(sql`
    with basis as (
      select
        ${sql.raw(SUPPLIER_KEY_SQL("po.supplier"))} as sleutel,
        po.supplier,
        coalesce(nullif(po.subtotal, 0),
                 case when coalesce(po.tax, 0) <> 0 then round(po.total - po.tax, 2) else po.total end,
                 0) as ex_btw,
        po.total,
        po.paid_at,
        po.order_date
      from purchase_orders po
      where po.supplier is not null and po.supplier <> ''
    )
    select
      sleutel,
      (array_agg(supplier order by length(supplier) desc))[1] as naam,
      count(*)::int as facturen,
      round(sum(ex_btw)::numeric, 2)::text as totaal_ex,
      round(sum(case when paid_at is null then total else 0 end)::numeric, 2)::text as openstaand,
      max(order_date)::text as laatste,
      exists (
        select 1 from workers w
        where ${sql.raw(SUPPLIER_KEY_SQL("w.name"))} = basis.sleutel
      ) as is_ploeg,
      exists (select 1 from overhead_suppliers o where o.supplier_key = basis.sleutel) as is_vaste_last
    from basis
    group by sleutel
    order by sum(ex_btw) desc nulls last
  `);

  const gefilterd = q
    ? rijen.filter((r) => r.naam.toLowerCase().includes(q.toLowerCase()))
    : rijen;

  const totaal = rijen.reduce((s, r) => s + Number(r.totaal_ex ?? 0), 0);
  const open = rijen.reduce((s, r) => s + Number(r.openstaand ?? 0), 0);
  const ploeg = rijen.filter((r) => r.is_ploeg).length;

  return (
    <>
      <PageHeader
        title="Leveranciers & ploeg"
        subtitle="alles wat we per partij hebben ingekocht — facturen, openstaand en waar het op geboekt is"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Partijen" value={rijen.length} />
        <StatTile label="Ingekocht (ex. btw)" value={formatEUR(totaal)} hint="alles bij elkaar" />
        <StatTile label="Nog te betalen" value={formatEUR(open)} tone={open > 0 ? "warning" : "neutral"} />
        <StatTile label="Eigen ploeg" value={ploeg} hint="bouwers en onderaannemers" />
      </div>

      <form method="get" className="mb-4 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Zoek een leverancier…" className="pl-9" />
        </div>
      </form>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Leverancier</Th>
              <Th className="text-right">Facturen</Th>
              <Th className="text-right">Ingekocht (ex. btw)</Th>
              <Th className="text-right">Nog te betalen</Th>
              <Th>Laatste factuur</Th>
            </tr>
          </THead>
          <TBody>
            {gefilterd.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="text-muted">
                  Geen leveranciers gevonden.
                </Td>
              </Tr>
            ) : (
              gefilterd.map((r) => (
                <Tr key={r.sleutel}>
                  <Td>
                    <Link href={`/leveranciers/${r.sleutel}`} className="font-medium hover:underline">
                      {r.naam}
                    </Link>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {r.is_ploeg && <Badge tone="accent">ploeg</Badge>}
                      {r.is_vaste_last && <Badge tone="neutral">vaste last</Badge>}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{r.facturen}</Td>
                  <Td className="text-right tabular-nums font-medium">{formatEUR(Number(r.totaal_ex ?? 0))}</Td>
                  <Td className="text-right tabular-nums">
                    {Number(r.openstaand ?? 0) > 0 ? (
                      <span className="text-warning">{formatEUR(Number(r.openstaand))}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {r.laatste
                      ? new Date(r.laatste).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
