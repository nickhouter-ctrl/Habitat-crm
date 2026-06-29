import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Field,
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
import { SubmitButton } from "@/components/submit-button";
import { Combobox, type ComboOption } from "@/components/combobox";
import { db } from "@/lib/db";
import { contacts, products, sampleMovements } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import { SAMPLE_DEPOSIT_EUR, SAMPLE_STATUS_LABEL } from "@/lib/samples";
import { giveSample, markSampleSold, returnSample } from "./actions";

export const metadata = { title: "Samples" };

export default async function SamplesPage() {
  const [stockAgg, movements, productRows, contactRows] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum(${products.sampleStockQty}), 0)::float8` })
      .from(products)
      .where(and(eq(products.isActive, true), isNotNull(products.sampleStockQty))),
    db.select().from(sampleMovements).orderBy(desc(sampleMovements.date), desc(sampleMovements.createdAt)),
    db
      .select({ id: products.id, name: products.name, sku: products.sku, sampleStockQty: products.sampleStockQty })
      .from(products)
      .where(and(eq(products.isActive, true), isNotNull(products.sampleStockQty)))
      .orderBy(asc(products.name)),
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).orderBy(asc(contacts.name)),
  ]);

  const out = movements.filter((m) => m.status === "out");
  const history = movements.filter((m) => m.status !== "out");
  const outQty = out.reduce((s, m) => s + Number(m.qty), 0);
  const outstandingDeposit = out.reduce((s, m) => s + Number(m.qty) * Number(m.depositEur), 0);
  const soldDeposit = history
    .filter((m) => m.status === "sold")
    .reduce((s, m) => s + Number(m.qty) * Number(m.depositEur), 0);

  // Uitstaande samples gegroepeerd per ontvanger (klant/wederverkoper).
  type OutRow = (typeof out)[number];
  const groups = new Map<string, { name: string; contactId: string | null; items: OutRow[]; qty: number; deposit: number }>();
  for (const m of out) {
    const key = m.recipientId ?? `n:${(m.recipientName ?? "—").toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { name: m.recipientName ?? "Onbekend", contactId: m.recipientId ?? null, items: [], qty: 0, deposit: 0 };
      groups.set(key, g);
    }
    g.items.push(m);
    g.qty += Number(m.qty);
    g.deposit += Number(m.qty) * Number(m.depositEur);
  }
  const groupList = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));

  const productOptions: ComboOption[] = productRows.map((p) => ({
    value: p.id,
    label: p.sku ? `${p.name} · ${p.sku}` : p.name,
    hint: `sample-voorraad ${p.sampleStockQty != null ? Number(p.sampleStockQty).toLocaleString("nl-NL") : "—"}`,
  }));
  const contactOptions: ComboOption[] = contactRows.map((c) => ({ value: c.id, label: c.name }));

  const dt = (d: unknown) => new Date(d as string).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <PageHeader title="Samples" subtitle={`Staaltjes · €${SAMPLE_DEPOSIT_EUR} borg per sample`} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In voorraad" value={Number(stockAgg[0]?.total ?? 0).toLocaleString("nl-NL")} hint="samples op de plank" tone="neutral" />
        <StatTile label="Uitstaand" value={outQty.toLocaleString("nl-NL")} hint={`${out.length} ${out.length === 1 ? "uitgifte" : "uitgiftes"}`} tone={outQty > 0 ? "info" : "neutral"} />
        <StatTile label="Borg uitstaand" value={formatEUR(outstandingDeposit)} hint="terug te betalen bij retour" tone={outstandingDeposit > 0 ? "warning" : "neutral"} />
        <StatTile label="Borg verkocht" value={formatEUR(soldDeposit)} hint="definitief · omzet" tone={soldDeposit > 0 ? "success" : "neutral"} />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Sample uitgeven</CardTitle>
          <span className="text-xs text-muted">gaat van de sample-voorraad af · €{SAMPLE_DEPOSIT_EUR} borg per stuk</span>
        </CardHeader>
        <form action={giveSample} className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.2fr_0.6fr_1.2fr_auto] lg:items-end">
          <Field label="Product">
            <Combobox name="productId" options={productOptions} placeholder="zoek product…" />
          </Field>
          <Field label="Naar wie (klant/wederverkoper)">
            <Combobox name="recipientId" options={contactOptions} placeholder="zoek contact…" clearable />
          </Field>
          <Field label="Aantal">
            <Input name="qty" inputMode="decimal" defaultValue="1" className="text-right" />
          </Field>
          <Field label="Notitie / naam (vrij)">
            <Input name="recipientName" placeholder="optioneel" />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Uitgeven</SubmitButton>
        </form>
      </Card>

      <Card className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Waar zijn mijn samples?</CardTitle>
          <span className="text-xs text-muted">uitstaande samples · {formatEUR(outstandingDeposit)} borg</span>
        </CardHeader>
        {out.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Geen samples uitstaand.</div>
        ) : (
          <div className="divide-y">
            {groupList.map((g) => (
              <details key={g.contactId ?? g.name} className="group/rec">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 marker:content-none hover:bg-muted/30">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="text-muted transition group-open/rec:rotate-90">▶</span>
                    {g.name}
                  </span>
                  <span className="text-sm text-muted tabular-nums">
                    {g.qty.toLocaleString("nl-NL")} {g.qty === 1 ? "sample" : "samples"} · {formatEUR(g.deposit)} borg
                  </span>
                </summary>
                <Table>
                  <THead>
                    <tr>
                      <Th>Datum</Th>
                      <Th>Product</Th>
                      <Th className="text-right">Aantal</Th>
                      <Th className="text-right">Borg</Th>
                      <Th>Acties</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {g.items.map((m) => (
                      <Tr key={m.id}>
                        <Td className="whitespace-nowrap">{dt(m.date)}</Td>
                        <Td>
                          {m.productName}
                          {m.sku ? <span className="block text-xs text-muted">{m.sku}</span> : null}
                          {m.note ? <span className="block text-xs text-muted">{m.note}</span> : null}
                        </Td>
                        <Td className="text-right tabular-nums">{Number(m.qty).toLocaleString("nl-NL")}</Td>
                        <Td className="text-right tabular-nums">{formatEUR(Number(m.qty) * Number(m.depositEur))}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <form action={returnSample.bind(null, m.id)}>
                              <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">retour</SubmitButton>
                            </form>
                            <form action={markSampleSold.bind(null, m.id)}>
                              <SubmitButton size="sm" variant="ghost" className="text-success" pendingLabel="…">verkocht</SubmitButton>
                            </form>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                {g.contactId && (
                  <div className="px-5 pb-3 text-xs">
                    <Link href={`/contacts/${g.contactId}`} className="text-accent hover:underline">→ contact openen</Link>
                  </div>
                )}
              </details>
            ))}
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <details className="group">
          <summary className="mb-2 cursor-pointer list-none text-sm font-medium text-muted marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span className="transition group-open:rotate-90">▶</span>
              Geschiedenis — retour / verkocht ({history.length})
            </span>
          </summary>
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <tr>
                  <Th>Datum</Th>
                  <Th>Product</Th>
                  <Th>Bij wie</Th>
                  <Th className="text-right">Aantal</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {history.map((m) => (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap">{dt(m.date)}</Td>
                    <Td>{m.productName}{m.sku ? <span className="block text-xs text-muted">{m.sku}</span> : null}</Td>
                    <Td>{m.recipientName ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{Number(m.qty).toLocaleString("nl-NL")}</Td>
                    <Td><Badge tone={m.status === "sold" ? "success" : "neutral"}>{SAMPLE_STATUS_LABEL[m.status]}</Badge></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </details>
      )}
    </>
  );
}
