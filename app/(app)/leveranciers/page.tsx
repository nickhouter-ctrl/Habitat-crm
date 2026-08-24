/**
 * Leveranciers — één regel per partij waar we spullen of diensten van kopen.
 *
 * De eigen ploeg staat hier bewust NIET tussen: die heeft op /ploeg een eigen
 * pagina per persoon, met uren, tarieven en werven. Het zijn twee soorten
 * relaties, en door ze door elkaar te zetten vond je geen van beide terug.
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
import { workers } from "@/lib/db/schema";
import { naamHoortBij } from "@/lib/purchase-orders";
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "Leveranciers" };

type Rij = {
  sleutel: string;
  naam: string;
  facturen: number;
  totaal_ex: string | null;
  ploeg_id: string | null;
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
        po.order_date
      from purchase_orders po
      where po.supplier is not null and po.supplier <> ''
    )
    select
      sleutel,
      (array_agg(supplier order by length(supplier) desc))[1] as naam,
      count(*)::int as facturen,
      round(sum(ex_btw)::numeric, 2)::text as totaal_ex,
      max(order_date)::text as laatste,
      exists (select 1 from overhead_suppliers o where o.supplier_key = basis.sleutel) as is_vaste_last
    from basis
    group by sleutel
    order by sum(ex_btw) desc nulls last
  `);

  // De eigen ploeg hoort niet in deze lijst: die heeft een eigen pagina met
  // uren, tarieven en werven. Hier staan de partijen waar we spullen en diensten
  // van kopen — dat zijn twee verschillende soorten relaties.
  //
  // Woord voor woord matchen en niet op de aaneengeplakte sleutel: zijn facturen
  // staan op "Wilhelmus Mark Strijks", zijn ploegkaart op "Wilhelmus Strijks".
  // Op de sleutel zijn dat twee partijen, en dan staat de halve ploeg alsnog
  // tussen de leveranciers.
  const ploeg = await db.select({ id: workers.id, name: workers.name }).from(workers);
  const bijPloeg = (naam: string) => ploeg.find((w) => naamHoortBij(w.name, naam)) ?? null;
  const verrijkt = rijen.map((r) => {
    const w = bijPloeg(r.naam);
    return { ...r, is_ploeg: !!w, ploeg_id: w?.id ?? null };
  });
  const leveranciers = verrijkt.filter((r) => !r.is_ploeg);
  const ploegrijen = verrijkt.filter((r) => r.is_ploeg);
  const gefilterd = q
    ? leveranciers.filter((r) => r.naam.toLowerCase().includes(q.toLowerCase()))
    : leveranciers;

  const totaal = leveranciers.reduce((s, r) => s + Number(r.totaal_ex ?? 0), 0);
  const ploegTotaal = ploegrijen.reduce((s, r) => s + Number(r.totaal_ex ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Leveranciers"
        subtitle="alles wat we per partij hebben ingekocht en waar het op geboekt is"
        actions={
          <Link href="/ploeg" className="text-sm text-accent hover:underline">
            Eigen ploeg →
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Leveranciers" value={leveranciers.length} />
        <StatTile label="Ingekocht (ex. btw)" value={formatEUR(totaal)} hint="alles bij elkaar" />
        <StatTile
          label="Eigen ploeg"
          value={ploegrijen.length}
          hint={`${formatEUR(ploegTotaal)} gefactureerd — staat op /ploeg`}
        />
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
              <Th>Laatste factuur</Th>
            </tr>
          </THead>
          <TBody>
            {gefilterd.length === 0 ? (
              <Tr>
                <Td colSpan={4} className="text-muted">
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
                      {r.is_vaste_last && <Badge tone="neutral">vaste last</Badge>}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{r.facturen}</Td>
                  <Td className="text-right tabular-nums font-medium">{formatEUR(Number(r.totaal_ex ?? 0))}</Td>
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
