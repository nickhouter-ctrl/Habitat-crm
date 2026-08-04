/**
 * Producten geleverd op dit project — binnen de aanneemsom, dus zonder losse
 * verkoopfactuur.
 *
 * Toont ook of de voorschotten die je al binnen hebt de geleverde waarde dekken.
 * Dat is de reden dat je met voorschotten werkt: je levert pas als het geld er
 * is, in plaats van het voor te schieten.
 */
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  LinkButton,
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
  ontvangenEx,
  kostenTotaal,
  aanneemsom,
  doorTeBelasten,
  fout,
}: {
  projectId: string;
  /** Wat er als voorschot binnen is (ex. btw) — om de dekking te tonen. */
  voorschottenEx: number;
  /** Alles wat er binnen is (ex. btw), dus ook betalingen op facturen. */
  ontvangenEx: number;
  /** Arbeid + inkoop + kostprijs van wat er al geleverd is. */
  kostenTotaal: number;
  /** De aanneemsom (of het doel) en wat er minimaal doorbelast moet worden. */
  aanneemsom: number;
  doorTeBelasten: number;
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
      .where(and(eq(products.isActive, true), gt(products.stockQty, "0")))
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
            {fout.slice(3)} {Number(fout.slice(3)) === 1 ? "regel" : "regels"} geboekt en van de voorraad af.
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

        {/* De vraag achter het voorschotten-model: schieten we voor of niet?
            Niet de verkoopwaarde maar ONZE KOSTEN afgezet tegen alles wat er
            binnen is — arbeid, inkoop en de kostprijs van wat er al geleverd is. */}
        <div className={`rounded-lg border p-3 ${ontvangenEx >= kostenTotaal ? "bg-success/5" : "bg-danger/5"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
            <span className="font-medium">Lopen we voor of achter?</span>
            <span className="text-muted">
              onze kosten tot nu toe <strong className="tabular-nums text-foreground">{formatEUR(kostenTotaal)}</strong>
            </span>
            <span className="text-muted">
              ontvangen <strong className="tabular-nums text-foreground">{formatEUR(ontvangenEx)}</strong>
            </span>
            <span className={`font-semibold tabular-nums ${ontvangenEx >= kostenTotaal ? "text-success" : "text-danger"}`}>
              {ontvangenEx >= kostenTotaal
                ? `+ ${formatEUR(ontvangenEx - kostenTotaal)} vooruit`
                : `− ${formatEUR(kostenTotaal - ontvangenEx)} voorgeschoten`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {ontvangenEx >= kostenTotaal
              ? "Er is meer binnen dan er tot nu toe is uitgegeven — precies waarvoor je met voorschotten werkt."
              : "Er is meer uitgegeven dan er binnen is: dit deel financier je zelf."}{" "}
            Alle bedragen ex. btw.
          </p>

          {/* Wat je nu zou moeten doen: geld vragen, of vastleggen dat het
              meerwerk is. Twee verschillende problemen, dus twee knoppen. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ontvangenEx < kostenTotaal && (
              <LinkButton
                href={`?vbedrag=${Math.ceil((kostenTotaal - ontvangenEx) / 1000) * 1000}&vtermijn=${encodeURIComponent(
                  "volgende termijn",
                )}#voorschot-opvragen`}
                variant="primary"
                size="sm"
                scroll={false}
              >
                Voorschot opvragen ({formatEUR(Math.ceil((kostenTotaal - ontvangenEx) / 1000) * 1000)})
              </LinkButton>
            )}
            {aanneemsom > 0 && doorTeBelasten > aanneemsom && (
              <LinkButton href="#meerwerk" variant="secondary" size="sm" scroll={false}>
                Meerwerk vastleggen ({formatEUR(doorTeBelasten - aanneemsom)} boven de aanneemsom)
              </LinkButton>
            )}
          </div>
          {aanneemsom > 0 && doorTeBelasten > aanneemsom && (
            <p className="mt-1 text-xs text-warning">
              Wat er doorbelast moet worden ({formatEUR(doorTeBelasten)}) ligt boven de aanneemsom van{" "}
              {formatEUR(aanneemsom)}. Dat verschil is geen voorschotkwestie maar meerwerk — leg het vast en laat de
              klant akkoord geven, anders draai je er zelf voor op.
            </p>
          )}
        </div>

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
            hint: `${Number(p.stockQty)} ${p.unit ?? "st"}${p.priceEur != null ? ` · ${formatEUR(Number(p.priceEur))}` : ""}`,
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
                  <Td className="text-right tabular-nums">{Number(r.qty)}</Td>
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
