import { eq } from "drizzle-orm";
import { ArrowLeft, Calculator, Check, AlertCircle, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, LinkButton, PageHeader, TBody, Table, Td, Th, THead, Tr, buttonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { mailAttachments, purchaseOrders } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/email-attachments";
import { computeLandedCost, getAttachmentsForPO } from "@/lib/landed-cost";
import { cn, formatEUR } from "@/lib/utils";

import { applyLandedCost, saveAttachmentAmount } from "./actions";

export const metadata = { title: "Kostenanalyse" };
export const dynamic = "force-dynamic";

export default async function KostenanalysePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po) notFound();

  const attachments = await getAttachmentsForPO(id);
  const result = computeLandedCost({ po, attachments });

  const items = (po.items ?? []) as Array<{
    productId?: string;
    productName?: string;
    sku?: string;
    quantity?: number;
    unitPrice?: number | string;
  }>;

  return (
    <>
      <PageHeader
        title={`Kostenanalyse — ${po.supplier}`}
        subtitle={po.reference ?? "Geen referentie"}
        actions={
          <LinkButton href={`/inkooporders/${id}`} variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Terug naar PO
          </LinkButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* LEFT: bijlagen + bedragen */}
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-medium">
            Gekoppelde facturen ({attachments.length})
          </h2>
          {attachments.length === 0 ? (
            <p className="text-sm text-muted">
              Nog geen mail-bijlagen gekoppeld aan deze PO. Ga naar{" "}
              <Link href="/inbox" className="underline">
                /inbox
              </Link>{" "}
              en link binnenkomende facturen aan deze PO.
            </p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Bijlage</Th>
                  <Th>Categorie</Th>
                  <Th>Bedrag €</Th>
                </tr>
              </THead>
              <TBody>
                {attachments.map((a) => (
                  <Tr key={a.id}>
                    <Td className="max-w-[20rem]">
                      <Link
                        href={`/api/archief/${a.id}`}
                        target="_blank"
                        className="block text-sm font-medium hover:underline"
                      >
                        {a.filename}
                      </Link>
                      <span className="block text-xs text-muted">
                        {a.supplierTag ?? "—"} · {a.emailSubject?.slice(0, 50)}
                      </span>
                    </Td>
                    <Td className="text-xs">
                      <Badge tone="neutral">
                        {CATEGORIES[a.category as keyof typeof CATEGORIES] ?? a.category}
                      </Badge>
                    </Td>
                    <Td>
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          await saveAttachmentAmount(
                            a.id,
                            String(formData.get("amount") ?? ""),
                            id,
                          );
                        }}
                        className="flex gap-1"
                      >
                        <input
                          type="number"
                          step="0.01"
                          name="amount"
                          defaultValue={a.amountEur ?? ""}
                          placeholder="0,00"
                          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-right"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-background-soft"
                          title="Opslaan"
                        >
                          ✓
                        </button>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          {result.missingAmounts > 0 && (
            <p className="mt-3 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertCircle className="h-3.5 w-3.5" />
              {result.missingAmounts} bijlage(s) zonder bedrag — vul in voor accurate berekening.
            </p>
          )}
        </Card>

        {/* RIGHT: berekening */}
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Calculator className="h-5 w-5" />
              Landed-cost berekening
            </h2>

            <div className="space-y-1.5 border-y border-border py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Factory-totaal (PO lijnen)</span>
                <span className="font-medium tabular-nums">
                  {formatEUR(result.factoryTotalEur)}
                </span>
              </div>
              {result.breakdown.map((b) => (
                <div key={b.category} className="flex justify-between text-xs">
                  <span className="text-muted">
                    + {b.categoryLabel}{" "}
                    <span className="opacity-60">({b.attachmentCount})</span>
                  </span>
                  <span className="tabular-nums">{formatEUR(b.amount)}</span>
                </div>
              ))}
              {result.breakdown.length === 0 && (
                <div className="text-xs italic text-muted">
                  (geen extra kosten ingevuld nog)
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
                <span className="font-medium">Landed total</span>
                <span className="font-semibold tabular-nums">
                  {formatEUR(result.landedTotalEur)}
                </span>
              </div>
            </div>

            <div className="rounded-md bg-accent/10 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Overhead ratio
              </p>
              <p className="text-2xl font-semibold text-accent tabular-nums">
                {(result.ratio * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-muted">
                Bovenop factory-prijs. Elk product wordt opgehoogd met dit %.
              </p>
            </div>

            {result.factoryTotalEur > 0 && result.overheadTotalEur > 0 && (
              <form
                action={async () => {
                  "use server";
                  await applyLandedCost(id, result.ratio);
                }}
              >
                <button className={cn(buttonClass({}), "w-full")}>
                  <Check className="h-4 w-4" /> Pas landed cost toe op alle producten
                </button>
                <p className="mt-2 text-xs text-muted">
                  Werkt purchaseCostEur bij voor elke product in PO ({items.filter((i) => i.productId).length} producten).
                </p>
              </form>
            )}

            {po.landedCostSummary && (
              <p className="text-xs text-success">
                ✓ Laatst toegepast:{" "}
                {new Date(po.landedCostSummary.appliedAt).toLocaleString("nl-NL")} —{" "}
                ratio {(po.landedCostSummary.ratio * 100).toFixed(2)}%
              </p>
            )}
          </Card>

          {/* Per-product preview */}
          {items.length > 0 && result.ratio > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Per-product impact
              </h3>
              <Table>
                <THead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Factory</Th>
                    <Th className="text-right">Nieuw</Th>
                  </tr>
                </THead>
                <TBody>
                  {items.slice(0, 10).map((it, i) => {
                    const factory = Number(it.unitPrice ?? 0);
                    const newCost = factory * (1 + result.ratio);
                    return (
                      <Tr key={i}>
                        <Td className="text-xs">
                          {it.sku ?? "—"} · {it.productName?.slice(0, 25)}
                        </Td>
                        <Td className="text-right text-xs tabular-nums">{formatEUR(factory)}</Td>
                        <Td className="text-right text-xs font-medium tabular-nums text-accent">
                          {formatEUR(newCost)}
                        </Td>
                      </Tr>
                    );
                  })}
                  {items.length > 10 && (
                    <Tr>
                      <Td colSpan={3} className="text-center text-xs italic text-muted">
                        + {items.length - 10} meer producten
                      </Td>
                    </Tr>
                  )}
                </TBody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
