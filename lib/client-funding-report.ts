import { maakT, type Locale } from "@/lib/i18n";
import type { AdvanceCover, ProjectMargins } from "@/lib/project-financials";
import type { ReportPdfInput } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

/** Explicit customer-facing projection: never pass costs, notes or profit to the PDF. */
export function clientFundingAmounts(
  cover: Pick<AdvanceCover, "totalReceived" | "ownProductReceived" | "requiredRevenue" | "saldo">,
  margins: Pick<ProjectMargins, "laborRevenue" | "purchaseRevenue" | "otherRevenue">,
) {
  return {
    received: cover.totalReceived,
    products: cover.ownProductReceived,
    work: cover.requiredRevenue,
    remaining: cover.saldo,
    labor: margins.laborRevenue,
    materials: margins.purchaseRevenue,
    other: margins.otherRevenue,
  };
}

export function clientFundingReport(input: {
  projectName: string;
  clientName: string | null;
  generatedAt: Date;
  locale: Locale;
  amounts: ReturnType<typeof clientFundingAmounts>;
}): ReportPdfInput {
  const { amounts: a, locale } = input;
  const t = maakT(locale);
  const columns = [{ header: t("Omschrijving"), flex: 4 }, { header: t("Bedrag"), align: "right" as const, flex: 1.5 }];
  return {
    locale,
    title: t("Voorschotoverzicht van uw project"),
    subtitle: [input.projectName, input.clientName ? t("voor {naam}", { naam: input.clientName }) : null].filter(Boolean).join(" - "),
    generatedAt: input.generatedAt,
    kpis: [
      { label: t("Totaal ontvangen"), value: formatEUR(a.received), hint: t("Alle bedragen ex. btw") },
      { label: t("Producten en werk"), value: formatEUR(Math.round((a.products + a.work) * 100) / 100) },
      { label: t(a.remaining < 0 ? "Nog aan te vullen" : "Resterend voorschot"), value: formatEUR(Math.abs(a.remaining)) },
    ],
    tables: [
      {
        title: t("Berekening van uw saldo"),
        subtitle: t("Ontvangen betalingen, verminderd met productbedragen en afgeboekt werk. Alle bedragen ex. btw."),
        columns,
        rows: [
          [t("Totaal ontvangen"), formatEUR(a.received)],
          [t("Af: ontvangen voor producten"), formatEUR(a.products)],
          [t("Afgeboekt werk"), formatEUR(a.work)],
          [t("Resterend voorschot"), formatEUR(a.remaining)],
        ],
        emphasizeRow: i => i === 3,
      },
      {
        title: t("Specificatie van het afgeboekte werk"),
        subtitle: t("Deze bedragen zijn opgenomen in het afgeboekte werk hierboven en worden niet nogmaals afgetrokken."),
        columns,
        rows: [
          [t("Arbeid"), formatEUR(a.labor)],
          [t("Bouwmaterialen"), formatEUR(a.materials)],
          [t("Overige werkzaamheden en diensten"), formatEUR(a.other)],
          [t("Totaal afgeboekt werk"), formatEUR(a.work)],
        ],
        emphasizeRow: i => i === 3,
      },
      {
        title: t("Toelichting"),
        columns: [{ header: "", flex: 1 }],
        rows: [
          [t("Productbedragen blijven bestemd voor de betreffende producten en zijn niet beschikbaar voor verdere werkzaamheden.")],
          [t(a.remaining < 0
            ? "Het afgeboekte werk overschrijdt het beschikbare voorschot. Het bedrag 'Nog aan te vullen' is het tekort op deze peildatum."
            : "Het resterende voorschot is beschikbaar voor verdere werkzaamheden.")],
          [t("Dit is een tussenstand op basis van verwerkte betalingen en afgeboekt werk op de datum van dit overzicht. Nog niet verwerkte werkzaamheden en betalingen zijn niet opgenomen. Dit overzicht is geen factuur of eindafrekening.")],
        ],
      },
    ],
  };
}
