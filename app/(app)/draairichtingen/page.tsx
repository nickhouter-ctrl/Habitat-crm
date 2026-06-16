import { eq, sql } from "drizzle-orm";
import Link from "next/link";

import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { documents, products, projects } from "@/lib/db/schema";
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
    .select({ id: products.id, sku: products.sku, additionalSizes: products.additionalSizes })
    .from(products)
    .where(sql`${products.sku} like 'DR-00%'`);
  const doorIds = new Set(doorProds.map((p) => p.id));
  // Per deur de bestaande richtingen (uit de uitvoeringen), zodat we alleen die
  // tonen — bv. Hotel Suite alleen S1/S2 i.p.v. altijd S1–S4.
  const orientsByProduct = new Map<string, { key: string; label: string }[]>();
  for (const p of doorProds) {
    const sizes = (p.additionalSizes as Array<{ label?: string }> | null) ?? [];
    const list = sizes
      .map((s) => {
        const m = (s.label ?? "").match(/\bS([1-4])\b/);
        return m ? { key: `S${m[1]}`, label: s.label ?? `S${m[1]}` } : null;
      })
      .filter((x): x is { key: string; label: string } => !!x);
    if (list.length) orientsByProduct.set(p.id, list);
  }

  const invoices = await db
    .select({
      id: documents.id,
      docNumber: documents.docNumber,
      title: documents.title,
      items: documents.items,
      projectName: projects.name,
    })
    .from(documents)
    .leftJoin(projects, eq(documents.projectId, projects.id))
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                    Factuur <span className="text-muted">{d.docNumber ?? "(geen nr.)"}</span>
                    {d.title && <span className="ml-1 text-sm text-muted">— {d.title}</span>}
                  </Link>
                  {d.projectName && (
                    <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                      📁 {d.projectName}
                    </span>
                  )}
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
                      {(orientsByProduct.get(it.productId!) ?? ORIENTS).map((o) => (
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
