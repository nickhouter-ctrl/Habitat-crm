import { eq, sql } from "drizzle-orm";
import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents, products } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { assignDoorOrientation } from "./actions";

export const metadata = { title: "Draairichtingen" };
export const dynamic = "force-dynamic";

const ORIENTS: { key: string; label: string }[] = [
  { key: "S1", label: "S1 · Links inwaarts" },
  { key: "S2", label: "S2 · Rechts inwaarts" },
  { key: "S3", label: "S3 · Links uitwaarts" },
  { key: "S4", label: "S4 · Rechts uitwaarts" },
];

export default async function DraairichtingenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const doorProds = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(sql`${products.sku} like 'DR-00%'`);
  const doorIds = new Set(doorProds.map((p) => p.id));

  const invoices = await db
    .select({ id: documents.id, docNumber: documents.docNumber, title: documents.title, items: documents.items })
    .from(documents)
    .where(eq(documents.kind, "invoice"));

  // Per factuur de deurregels zonder gekozen draairichting (S1–S4).
  const todo = invoices
    .map((d) => {
      const lines = normalizeDocItems(d.items)
        .map((it, index) => ({ it, index }))
        .filter(
          ({ it }) =>
            it.productId &&
            doorIds.has(it.productId) &&
            Number(it.units) > 0 &&
            !/\bS[1-4]\b/.test(`${it.name ?? ""} ${it.description ?? ""}`),
        );
      return lines.length ? { ...d, lines } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Draairichtingen toewijzen"
        subtitle="Verdeel per factuur de deuren over de draairichtingen (S1–S4)."
      />

      {sp.saved === "1" && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Draairichting toegewezen.</p>
      )}
      {sp.error === "sum" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          Het totaal van de draairichtingen moet gelijk zijn aan het aantal deuren op de regel.
        </p>
      )}

      {todo.length === 0 ? (
        <EmptyState
          icon={<span>🚪</span>}
          title="Niets te doen"
          description="Alle deur-facturen hebben een draairichting toegewezen."
        />
      ) : (
        <div className="space-y-4">
          {todo.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                    Factuur <span className="text-muted">{d.docNumber ?? "(geen nr.)"}</span>
                    {d.title && <span className="ml-1 text-sm text-muted">— {d.title}</span>}
                  </Link>
                </div>
                {d.lines.map(({ it, index }) => (
                  <form
                    key={index}
                    action={assignDoorOrientation.bind(null, d.id, it.productId!, index)}
                    className="rounded-lg border border-border bg-background/60 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{it.name}</span>
                      <span className="text-sm text-muted">
                        Totaal: <span className="font-semibold tabular-nums text-foreground">{Number(it.units)}</span> stuks
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {ORIENTS.map((o) => (
                        <label key={o.key} className="block text-xs">
                          <span className="mb-1 block font-medium text-muted">{o.label}</span>
                          <Input name={o.key} type="number" min={0} step={1} defaultValue="0" className="text-right tabular-nums" />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <SubmitButton pendingLabel="Opslaan…">Toewijzen</SubmitButton>
                    </div>
                  </form>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
