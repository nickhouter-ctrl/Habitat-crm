import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
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

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Wat werkt") };
}

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
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
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
        title={uiT("Wat werkt")}
        subtitle={
          computedAt
            ? uiT("Prestaties per creative-eigenschap over de laatste 90 dagen · herbouwd {v0}", { v0: computedAt.toLocaleString(uiDateLocale, { dateStyle: "medium", timeStyle: "short" }) })
            : uiT("Prestaties per creative-eigenschap over de laatste 90 dagen")
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={uiT("Nog geen advertentiedata")}
          description={uiT("Zodra advertenties draaien en de nachtelijke herbouw heeft gelopen, verschijnt hier per eigenschap (sjabloon, palet, taal, …) wat aantoonbaar werkt. Oordelen verschijnen pas vanaf {v0} impressies en {v1} advertentie-dagen.", { v0: MIN_IMPRESSIONS.toLocaleString(uiDateLocale), v1: MIN_AD_DAYS })}
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
                      <Th>{uiT("Waarde")}</Th>
                      <Th className="text-right">{uiT("CTR (95% ondergrens)")}</Th>
                      <Th className="text-right">{uiT("Kosten/lead (EB)")}</Th>
                      <Th className="text-right">{uiT("Basis")}</Th>
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
                              {row.adCount} {uiT("adv. ·")} {row.adDays} {uiT("adv.-dagen ·")}{" "}
                              {row.impressions.toLocaleString(uiDateLocale)} {uiT("impr.")} </Td>
                          </>
                        ) : (
                          <>
                            <Td colSpan={2} className="text-right">
                              <Badge tone="neutral">{uiT("nog te weinig data")}</Badge>
                            </Td>
                            <Td className="text-right text-xs text-muted">
                              {row.adCount} {uiT("adv. ·")} {row.adDays} {uiT("adv.-dagen ·")}{" "}
                              {row.impressions.toLocaleString(uiDateLocale)} {uiT("impr.")} </Td>
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
        {uiT("De rangorde gebruikt de")} <strong>{uiT("Wilson-ondergrens (95%)")}</strong> {uiT("van de CTR, niet het rauwe percentage — zo wint een advertentie met 3 klikken op 11 impressies het niet van een bewezen presteerder. Kosten per lead zijn met")} <strong>{uiT("empirical Bayes")}</strong> {uiT("naar het accountgemiddelde getrokken, gewogen naar volume. Oordelen verschijnen pas vanaf")}{" "}
        {MIN_IMPRESSIONS.toLocaleString(uiDateLocale)} {uiT("impressies én")} {MIN_AD_DAYS} {uiT("advertentie-dagen per waarde. De leerlaag adviseert; een mens beslist.")} </p>
    </>
  );
}
