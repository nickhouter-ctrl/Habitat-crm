/**
 * Producten geleverd op dit project — binnen de aanneemsom, dus zonder losse
 * verkoopfactuur.
 *
 * Toont ook of de voorschotten die je al binnen hebt de geleverde waarde dekken.
 * Dat is de reden dat je met voorschotten werkt: je levert pas als het geld er
 * is, in plaats van het voor te schieten.
 */
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { DeliveryLinesForm } from "./delivery-lines";
import { db } from "@/lib/db";
import { products, projectDeliveries, users } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import { deliverToProject, reverseDelivery } from "../actions";

export async function ProjectDeliveriesCard({
  projectId,
  voorschottenEx,
  fout,
}: {
  projectId: string;
  /** Wat er als voorschot binnen is (ex. btw) — om de dekking te tonen. */
  voorschottenEx: number;
  fout?: string;
}) {
  const [voorraad, regels] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        stockQty: products.stockQty,
        unit: products.unit,
        costEur: products.costEur,
        priceEur: products.priceEur,
      })
      .from(products)
      // Ook zonder voorraad kiesbaar: wat er niet ligt moet besteld worden, maar
      // het hoort wél al aan de werf te hangen.
      .where(eq(products.isActive, true))
      .orderBy(products.name),
    db
      .select({
        id: projectDeliveries.id,
        productId: projectDeliveries.productId,
        productName: projectDeliveries.productName,
        sku: projectDeliveries.sku,
        qty: projectDeliveries.qty,
        totalCostEur: projectDeliveries.totalCostEur,
        totalPriceEur: projectDeliveries.totalPriceEur,
        toOrderQty: projectDeliveries.toOrderQty,
        date: projectDeliveries.date,
        note: projectDeliveries.note,
        reversedAt: projectDeliveries.reversedAt,
        door: users.name,
      })
      .from(projectDeliveries)
      .leftJoin(users, eq(users.id, projectDeliveries.createdBy))
      .where(eq(projectDeliveries.projectId, projectId))
      .orderBy(desc(projectDeliveries.date)),
  ]);

  const actief = regels.filter((r) => !r.reversedAt);
  const kost = actief.reduce((s, r) => s + Number(r.totalCostEur ?? 0), 0);
  const verkoop = actief.reduce((s, r) => s + Number(r.totalPriceEur ?? 0), 0);
  const gedekt = voorschottenEx >= verkoop;
  const teBestellen = actief.filter((r) => Number(r.toOrderQty ?? 0) > 0);

  return (
    <Card id="leveringen" className="mb-5 scroll-mt-24">
      <CardHeader>
        <CardTitle>Producten geleverd op dit project</CardTitle>
        <span className="text-xs text-muted">
          binnen de aanneemsom — geen losse factuur · voorraad gaat eraf, verkoopprijs telt mee in wat je doorbelast
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {fout?.startsWith("ok:") && (
          <p className="rounded-md bg-success/10 p-3 text-sm">
            {fout.split(":")[1]} {Number(fout.split(":")[1]) === 1 ? "regel" : "regels"} geboekt.
            {fout.split(":")[2]
              ? ` ${fout.split(":")[2]} stuks lagen niet op voorraad — die staan hieronder als nog te bestellen.`
              : " Alles ging van de voorraad af."}
          </p>
        )}
        {fout?.startsWith("deels:") && (
          <p className="rounded-md bg-warning/10 p-3 text-sm">
            {fout.split(":")[1]} geboekt · niet gelukt: {decodeURIComponent(fout.split(":").slice(2).join(":"))}
          </p>
        )}
        {fout === "leeg" && (
          <p className="rounded-md bg-warning/10 p-3 text-sm">Niets geboekt — vul minstens één product met aantal in.</p>
        )}

        {actief.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Kostprijs geleverd</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(kost)}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted">Door te belasten (verkoop)</p>
              <p className="text-lg font-semibold tabular-nums">{formatEUR(verkoop)}</p>
            </div>
            <div className={`rounded-lg border p-3 ${gedekt ? "bg-success/5" : "bg-warning/5"}`}>
              <p className="text-xs text-muted">Gedekt door voorschotten</p>
              <p className={`text-lg font-semibold tabular-nums ${gedekt ? "text-success" : "text-warning"}`}>
                {gedekt ? "ja" : `nee — ${formatEUR(verkoop - voorschottenEx)} te kort`}
              </p>
              <p className="text-xs text-muted">{formatEUR(voorschottenEx)} voorschot ontvangen</p>
            </div>
          </div>
        )}

        {teBestellen.length > 0 && (
          <div className="rounded-md bg-warning/10 p-3 text-sm">
            <p className="font-medium">Nog te bestellen voor deze werf</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {teBestellen.map((r) => (
                <li key={r.id}>
                  {Number(r.toOrderQty)} × {r.productName}
                  {r.sku ? ` · ${r.sku}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Deze stonden niet (voldoende) op voorraad. Ze tellen wél mee in de kosten en in wat je doorbelast — zet ze
              op een{" "}
              <Link href="/bestellen" className="text-accent underline underline-offset-2">
                bestelbon
              </Link>{" "}
              zodat ze ook echt komen.
            </p>
          </div>
        )}

        <p className="rounded-md bg-background p-3 text-xs text-muted">
          <strong className="text-foreground">Let op bij de inkoop.</strong> De kostprijs komt hier via het product uit
          de catalogus. Koppel de inkooporder van diezelfde goederen dan <em>niet</em> óók aan dit project — dan staan
          de kosten er twee keer op. Inkooporders koppel je alleen voor spullen of werk die rechtstreeks voor deze werf
          zijn gekocht en niet via de voorraad lopen.
        </p>

        <DeliveryLinesForm
          action={deliverToProject.bind(null, projectId)}
          producten={voorraad.map((p) => ({
            value: p.id,
            label: p.sku ? `${p.name} · ${p.sku}` : p.name,
            hint: `${Number(p.stockQty ?? 0) > 0 ? `${Number(p.stockQty)} ${p.unit ?? "st"}` : "niet op voorraad"}${
              p.priceEur != null ? ` · ${formatEUR(Number(p.priceEur))}` : ""
            }`,
          }))}
        />

        {regels.length > 0 && (
          <Table>
            <THead>
              <tr>
                <Th>Datum</Th>
                <Th>Product</Th>
                <Th className="text-right">Aantal</Th>
                <Th className="text-right">Kostprijs</Th>
                <Th className="text-right">Verkoop</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {regels.map((r) => (
                <Tr key={r.id} className={r.reversedAt ? "opacity-50" : undefined}>
                  <Td className="whitespace-nowrap text-muted">
                    {new Date(r.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                  </Td>
                  <Td>
                    {r.productId ? (
                      <Link href={`/products/${r.productId}/edit`} className="font-medium hover:underline">
                        {r.productName}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.productName}</span>
                    )}
                    {r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {Number(r.qty)}
                    {Number(r.toOrderQty ?? 0) > 0 && (
                      <span className="block text-xs text-warning">{Number(r.toOrderQty)} te bestellen</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{formatEUR(Number(r.totalCostEur ?? 0))}</Td>
                  <Td className="text-right tabular-nums font-medium">{formatEUR(Number(r.totalPriceEur ?? 0))}</Td>
                  <Td className="text-right">
                    {r.reversedAt ? (
                      <Badge tone="neutral">teruggedraaid</Badge>
                    ) : (
                      <form action={reverseDelivery.bind(null, projectId, r.id)}>
                        <ConfirmSubmit
                          message={`${r.productName} × ${Number(r.qty)} terugdraaien? De voorraad gaat weer omhoog.`}
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
      </CardContent>
    </Card>
  );
}
