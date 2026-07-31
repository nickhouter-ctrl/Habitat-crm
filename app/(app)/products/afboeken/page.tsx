/**
 * Voorraad afboeken zonder verkoop: showroommodel, eigen gebruik, breuk.
 *
 * Voorheen kon dat alleen door het aantal met de hand op het product te
 * wijzigen — zonder reden, zonder datum, zonder wie. Hier blijft alles staan,
 * mét de kostprijs van dat moment, en is elke afboeking terug te draaien.
 */
import { and, asc, desc, eq, gt, isNotNull, or, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
  Textarea,
} from "@/components/ui";
import { Combobox, type ComboOption } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { db } from "@/lib/db";
import { products, projects, stockWriteoffs, users } from "@/lib/db/schema";
import { REASON_LABEL, WRITEOFF_REASONS } from "@/lib/stock-writeoff";
import { formatEUR } from "@/lib/utils";
import { reverseStockWriteoffAction, writeOffStockAction } from "./actions";

export const metadata = { title: "Voorraad afboeken" };

export default async function VoorraadAfboekenPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fout?: string }>;
}) {
  const { ok, fout } = await searchParams;

  const [voorraadProducten, projectOpts, historie, totaal] = await Promise.all([
    // Alleen wat er ligt: 221 van de 1342 producten hebben voorraad, dus een
    // lijst van alles zou onwerkbaar zijn. Telverschillen op een product zonder
    // voorraad kun je nog steeds op het product zelf rechtzetten.
    db
      .select({ id: products.id, name: products.name, sku: products.sku, stockQty: products.stockQty, unit: products.unit, costEur: products.costEur })
      .from(products)
      .where(and(eq(products.isActive, true), gt(products.stockQty, "0")))
      .orderBy(asc(products.name)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(or(eq(projects.status, "active"), eq(projects.status, "completed")))
      .orderBy(asc(projects.name)),
    db
      .select({
        id: stockWriteoffs.id,
        productId: stockWriteoffs.productId,
        productName: stockWriteoffs.productName,
        sku: stockWriteoffs.sku,
        qty: stockWriteoffs.qty,
        reason: stockWriteoffs.reason,
        totalCostEur: stockWriteoffs.totalCostEur,
        date: stockWriteoffs.date,
        note: stockWriteoffs.note,
        reversedAt: stockWriteoffs.reversedAt,
        projectName: projects.name,
        projectId: stockWriteoffs.projectId,
        door: users.name,
      })
      .from(stockWriteoffs)
      .leftJoin(projects, eq(projects.id, stockWriteoffs.projectId))
      .leftJoin(users, eq(users.id, stockWriteoffs.createdBy))
      .orderBy(desc(stockWriteoffs.date), desc(stockWriteoffs.createdAt))
      .limit(100),
    db
      .select({
        aantal: sql<number>`count(*)::int`,
        kosten: sql<number>`coalesce(sum(${stockWriteoffs.totalCostEur}), 0)::float8`,
      })
      .from(stockWriteoffs)
      .where(and(isNotNull(stockWriteoffs.id), sql`${stockWriteoffs.reversedAt} is null`)),
  ]);

  // Voorraad en kostprijs als hint in de lijst: dan zie je meteen of afboeken
  // kan en wat het kost, zonder eerst het product te openen.
  const productOptions: ComboOption[] = voorraadProducten.map((p) => ({
    value: p.id,
    label: p.sku ? `${p.name} · ${p.sku}` : p.name,
    hint: `${Number(p.stockQty)} ${p.unit ?? "st"}${p.costEur != null ? ` · ${formatEUR(Number(p.costEur))}` : ""}`,
  }));

  const som = totaal[0] ?? { aantal: 0, kosten: 0 };
  const vandaag = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Voorraad afboeken"
        subtitle="showroom, eigen gebruik, monsters en breuk — alles wat eraf gaat zonder verkoop"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Afboekingen" value={som.aantal} hint="niet teruggedraaid" />
        <StatTile label="Kostprijs afgeboekt" value={formatEUR(som.kosten)} hint="wat het ons kostte" />
        <StatTile label="Producten met voorraad" value={voorraadProducten.length} />
      </div>

      {ok && (
        <p className="mb-4 rounded-md bg-success/10 p-3 text-sm">
          Afgeboekt. De voorraad is bijgewerkt{" "}
          <span className="text-muted">— staat er een project bij, dan is de kostprijs daar als kostenregel geboekt.</span>
        </p>
      )}
      {fout && (
        <p className="mb-4 rounded-md bg-danger/10 p-3 text-sm">
          {fout.startsWith("tekort:")
            ? `Niet afgeboekt: er ligt maar ${fout.slice(7)}. Kies een lager aantal, of boek het als telverschil.`
            : fout === "aantal"
              ? "Vul een aantal groter dan nul in."
              : "Kies een product."}
        </p>
      )}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Afboeken</CardTitle>
          <span className="text-xs text-muted">de kostprijs van nu wordt vastgelegd — later prijswijzigen verandert dit niet</span>
        </CardHeader>
        <CardContent>
          <form action={writeOffStockAction} className="grid gap-3 lg:grid-cols-[2fr_0.7fr_1fr_1.2fr_0.9fr_auto] lg:items-end">
            <Field label="Product" hint="typ een naam of SKU">
              <Combobox
                name="productId"
                options={productOptions}
                placeholder="zoek product…"
                clearable
                menuClassName="w-[28rem]"
              />
            </Field>
            <Field label="Aantal" htmlFor="qty">
              <Input id="qty" name="qty" inputMode="decimal" required className="text-right" placeholder="1" />
            </Field>
            <Field label="Reden" htmlFor="reason">
              <Select id="reason" name="reason" defaultValue="showroom">
                {WRITEOFF_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Project" htmlFor="projectId" hint="optioneel — dan telt de kostprijs daar mee">
              <Select id="projectId" name="projectId" defaultValue="">
                <option value="">— geen project —</option>
                {projectOpts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Datum" htmlFor="date">
              <Input id="date" name="date" type="date" defaultValue={vandaag} />
            </Field>
            <SubmitButton variant="primary" pendingLabel="Afboeken…">
              Afboeken
            </SubmitButton>
            <div className="lg:col-span-6">
              <Field label="Notitie" htmlFor="note">
                <Textarea id="note" name="note" rows={2} placeholder="bijv. showmodel in de showroom in Xàbia" />
              </Field>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Afgeboekt</CardTitle>
          <span className="text-xs text-muted">laatste 100 · terugdraaien zet de voorraad weer terug</span>
        </CardHeader>
        {historie.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">Nog niets afgeboekt.</p>
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Datum</Th>
                <Th>Product</Th>
                <Th className="text-right">Aantal</Th>
                <Th>Reden</Th>
                <Th>Project</Th>
                <Th className="text-right">Kostprijs</Th>
                <Th>Door</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {historie.map((h) => (
                <Tr key={h.id} className={h.reversedAt ? "opacity-50" : undefined}>
                  <Td className="whitespace-nowrap">
                    {new Date(h.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                  </Td>
                  <Td>
                    {h.productId ? (
                      <Link href={`/products/${h.productId}/edit`} className="font-medium hover:underline">
                        {h.productName}
                      </Link>
                    ) : (
                      <span className="font-medium">{h.productName}</span>
                    )}
                    {h.sku ? <span className="block text-xs text-muted">{h.sku}</span> : null}
                    {h.note ? <span className="block text-xs text-muted">{h.note}</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{Number(h.qty)}</Td>
                  <Td>
                    <Badge tone={h.reason === "damage" ? "danger" : h.reason === "correction" ? "warning" : "neutral"}>
                      {REASON_LABEL[h.reason] ?? h.reason}
                    </Badge>
                  </Td>
                  <Td>
                    {h.projectId ? (
                      <Link href={`/projects/${h.projectId}`} className="hover:underline">
                        {h.projectName}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {h.totalCostEur != null ? formatEUR(Number(h.totalCostEur)) : "—"}
                  </Td>
                  <Td className="text-xs text-muted">{h.door ?? "—"}</Td>
                  <Td className="text-right">
                    {h.reversedAt ? (
                      <span className="text-xs text-muted">teruggedraaid</span>
                    ) : (
                      <form action={reverseStockWriteoffAction.bind(null, h.id)}>
                        <ConfirmSubmit
                          message={`${h.productName} × ${Number(h.qty)} weer op voorraad zetten?`}
                          className="rounded p-1 text-xs text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          Terugdraaien
                        </ConfirmSubmit>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
