import { and, inArray, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";

import { ReportsNav } from "@/components/reports-nav";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { vatByMonth } from "@/lib/holded/accounting";
import { formatEUR } from "@/lib/utils";

export const metadata = { title: "BTW · Rapporten" };
export const dynamic = "force-dynamic";

const MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const qOf = (m: number) => Math.floor((m - 1) / 3) + 1;

type Row = { key: string; label: string; output: number; input: number };

export default async function BtwPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const periode: "maand" | "kwartaal" = sp.periode === "maand" ? "maand" : "kwartaal";

  // 1) Primaire bron: Holded IVA-grootboek (477 output / 472 input) per maand.
  let holded: { ym: string; output: number; input: number }[] = [];
  let holdedError: string | null = null;
  try {
    holded = await vatByMonth(24);
  } catch (e) {
    holdedError = e instanceof Error ? e.message : "Holded niet bereikbaar";
  }
  const holdedHasData = holded.some((m) => m.output !== 0 || m.input !== 0);

  // 2) Controle/fallback: btw op onze eigen facturen (totaal − subtotaal) per maand.
  const invRows = await db
    .select({
      ym: sql<string>`to_char(${documents.issueDate}, 'YYYY-MM')`,
      vat: sql<string>`coalesce(sum(case when ${documents.kind} = 'invoice' then ${documents.totalEur} - ${documents.subtotalEur} when ${documents.kind} = 'creditnote' then -(${documents.totalEur} - ${documents.subtotalEur}) else 0 end), 0)::text`,
    })
    .from(documents)
    .where(
      and(
        inArray(documents.kind, ["invoice", "creditnote"]),
        inArray(documents.status, ["sent", "paid"]),
        isNotNull(documents.issueDate),
      ),
    )
    .groupBy(sql`to_char(${documents.issueDate}, 'YYYY-MM')`);
  const invByYm = new Map(invRows.map((r) => [r.ym, Math.round(Number(r.vat) * 100) / 100]));

  // Bepaal de bron: Holded als die data heeft, anders onze facturen (alleen output).
  const useHolded = holdedHasData;
  // Bouw 24 maanden.
  const now = new Date();
  const months: { ym: string; output: number; input: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (useHolded) {
      const h = holded.find((x) => x.ym === ym);
      months.push({ ym, output: h?.output ?? 0, input: h?.input ?? 0 });
    } else {
      months.push({ ym, output: invByYm.get(ym) ?? 0, input: 0 });
    }
  }

  // Groeperen per gekozen periode.
  const rows: Row[] = [];
  if (periode === "maand") {
    for (const m of months.slice(-12)) {
      const [y, mm] = m.ym.split("-").map(Number);
      rows.push({ key: m.ym, label: `${MONTHS_NL[mm - 1]} ${y}`, output: m.output, input: m.input });
    }
  } else {
    const byQ = new Map<string, Row>();
    for (const m of months) {
      const [y, mm] = m.ym.split("-").map(Number);
      const key = `${y}-Q${qOf(mm)}`;
      const r = byQ.get(key) ?? { key, label: `Q${qOf(mm)} ${y}`, output: 0, input: 0 };
      r.output += m.output;
      r.input += m.input;
      byQ.set(key, r);
    }
    rows.push(...[...byQ.values()].slice(-8));
  }
  rows.reverse(); // nieuwste bovenaan
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return (
    <>
      <PageHeader
        title="BTW-overzicht"
        subtitle={
          useHolded
            ? "Uit de Holded-boekhouding (IVA repercutido 477 − IVA soportado 472) · af te dragen per periode"
            : "Btw op je eigen facturen (Holded niet beschikbaar — inkoop-btw ontbreekt)"
        }
      />
      <ReportsNav active="/rapporten/btw" />

      {holdedError && !holdedHasData && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Holded-boekhouding niet bereikbaar ({holdedError}) — toont btw op je eigen facturen (zonder inkoop-btw).
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Af te dragen btw</CardTitle>
          <div className="flex gap-1 text-sm">
            <Link
              href="/rapporten/btw?periode=kwartaal"
              className={`rounded-md px-2.5 py-1 font-medium ${periode === "kwartaal" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"}`}
            >
              Per kwartaal
            </Link>
            <Link
              href="/rapporten/btw?periode=maand"
              className={`rounded-md px-2.5 py-1 font-medium ${periode === "maand" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"}`}
            >
              Per maand
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <Th>Periode</Th>
                <Th className="text-right">Btw op omzet</Th>
                <Th className="text-right">Btw op inkoop</Th>
                <Th className="text-right">Af te dragen</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const due = r2(r.output - r.input);
                return (
                  <Tr key={r.key}>
                    <Td className="font-medium">{r.label}</Td>
                    <Td className="text-right tabular-nums">{formatEUR(r2(r.output))}</Td>
                    <Td className="text-right tabular-nums text-muted">{useHolded ? formatEUR(r2(r.input)) : "—"}</Td>
                    <Td className={`text-right font-semibold tabular-nums ${due > 0 ? "text-danger" : due < 0 ? "text-success" : ""}`}>
                      {formatEUR(due)}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted">
        {useHolded
          ? "Btw op omzet = IVA repercutido (verkoop), btw op inkoop = IVA soportado (inkoop). Af te dragen = omzet-btw − inkoop-btw. Een negatief bedrag betekent terug te vorderen."
          : "Btw op omzet = totaal − subtotaal van verstuurde/betaalde facturen (minus creditnota's). Koppel Holded om ook de inkoop-btw te zien."}
      </p>
    </>
  );
}
