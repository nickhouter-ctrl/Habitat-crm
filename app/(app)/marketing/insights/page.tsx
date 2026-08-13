/**
 * "Wat werkt" (brief §8): per facet de rangorde op Wilson lower bound, met
 * betrouwbaarheidsondergrens, steekproefgrootte en advertentie-dagen
 * zichtbaar. Onder de oordeeldrempel staat er letterlijk "nog te weinig
 * data" — geen grijs balkje dat op een resultaat lijkt.
 */
import { desc, sql } from "drizzle-orm";

import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { formatEUR } from "@/lib/utils";
import { db } from "@/lib/db";
import { facetPerformance } from "@/lib/db/schema";
import { MIN_AD_DAYS, MIN_IMPRESSIONS } from "@/lib/marketing/stats";

export const metadata = { title: "Wat werkt" };

const FACET_LABELS: Record<string, string> = {
  template: "Sjabloon",
  palette: "Palet",
  format: "Formaat",
  locale: "Taal",
  copy_angle: "Invalshoek",
  product_category: "Productcategorie",
  asset_source: "Beeldbron",
  has_price_badge: "Prijsbadge",
  headline_length_bucket: "Koplengte",
  audience_segment: "Doelgroep-as",
};

/** Wilson-ondergrens als NL-percentage, bv. "1,8%". */
function pct(value: string | null): string {
  return `${(Number(value ?? 0) * 100).toFixed(1).replace(".", ",")}%`;
}

export default async function InsightsPage() {
  const rows = await db
    .select()
    .from(facetPerformance)
    .orderBy(
      facetPerformance.facet,
      desc(facetPerformance.meetsThreshold),
      desc(sql`${facetPerformance.ctrWilsonLower}::numeric`),
    );

  const computedAt = rows[0]?.computedAt;
  const facetNames = Object.keys(FACET_LABELS).filter((f) =>
    rows.some((r) => r.facet === f),
  );

  return (
    <>
      <PageHeader
        title="Wat werkt"
        subtitle={
          computedAt
            ? `Prestaties per creative-eigenschap over de laatste 90 dagen · herbouwd ${computedAt.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}`
            : "Prestaties per creative-eigenschap over de laatste 90 dagen"
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen advertentiedata"
          description={`Zodra advertenties draaien en de nachtelijke herbouw heeft gelopen, verschijnt hier per eigenschap (sjabloon, palet, taal, …) wat aantoonbaar werkt. Oordelen verschijnen pas vanaf ${MIN_IMPRESSIONS.toLocaleString("nl-NL")} impressies en ${MIN_AD_DAYS} advertentie-dagen.`}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {facetNames.map((facet) => {
            const facetRows = rows.filter((r) => r.facet === facet);
            return (
              <Card key={facet} className="p-4">
                <h2 className="mb-3 text-sm font-semibold">{FACET_LABELS[facet]}</h2>
                <Table>
                  <THead>
                    <Tr>
                      <Th>Waarde</Th>
                      <Th className="text-right">CTR (95% ondergrens)</Th>
                      <Th className="text-right">Kosten/lead (EB)</Th>
                      <Th className="text-right">Basis</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {facetRows.map((row) => (
                      <Tr key={row.id}>
                        <Td className="font-medium">{row.value}</Td>
                        {row.meetsThreshold ? (
                          <>
                            <Td className="text-right tabular-nums">
                              ≥ {pct(row.ctrWilsonLower)}
                            </Td>
                            <Td className="text-right tabular-nums">
                              {row.cplEbEur ? formatEUR(row.cplEbEur) : "—"}
                            </Td>
                            <Td className="text-right text-xs text-muted">
                              {row.adCount} adv. · {row.adDays} adv.-dagen ·{" "}
                              {row.impressions.toLocaleString("nl-NL")} impr.
                            </Td>
                          </>
                        ) : (
                          <>
                            <Td colSpan={2} className="text-right">
                              <Badge tone="neutral">nog te weinig data</Badge>
                            </Td>
                            <Td className="text-right text-xs text-muted">
                              {row.adCount} adv. · {row.adDays} adv.-dagen ·{" "}
                              {row.impressions.toLocaleString("nl-NL")} impr.
                            </Td>
                          </>
                        )}
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-5 max-w-3xl text-xs text-muted">
        De rangorde gebruikt de <strong>Wilson-ondergrens (95%)</strong> van de CTR, niet het
        rauwe percentage — zo wint een advertentie met 3 klikken op 11 impressies het niet van
        een bewezen presteerder. Kosten per lead zijn met <strong>empirical Bayes</strong> naar
        het accountgemiddelde getrokken, gewogen naar volume. Oordelen verschijnen pas vanaf{" "}
        {MIN_IMPRESSIONS.toLocaleString("nl-NL")} impressies én {MIN_AD_DAYS} advertentie-dagen
        per waarde. De leerlaag adviseert; een mens beslist.
      </p>
    </>
  );
}
