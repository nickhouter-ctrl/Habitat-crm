import { tekst } from "@/lib/i18n/server";
import type { AdvanceCover } from "@/lib/project-financials";
import { formatEUR } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";

/** Show the same three amounts used by the advance calculation. */
export async function ProjectFundingSummary({ cover, details = "dialog" }: {
  cover: AdvanceCover; details?: "dialog" | "inline";
}) {
  const t = await tekst();
  const otherClientValue = Math.round((cover.requiredRevenue - cover.prefinanced) * 100) / 100;
  const breakdown = <div data-funding-breakdown>
    <dl className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Geboekte kosten van uren en externe inkoop")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.prefinanced)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt className="max-w-sm">{t("Opslag, eigen producten en meerwerk, na correcties")}</dt><dd className="font-medium tabular-nums">{formatEUR(otherClientValue)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><dt className="font-semibold">{t("Geboekt werk tegen klantprijs")}</dt><dd className="font-semibold tabular-nums">{formatEUR(cover.requiredRevenue)}</dd></div>
    </dl>
    <p className="mt-4 text-sm leading-relaxed text-muted">{t("De klantprijs bevat de afgesproken opslag op uren en inkoop, de verkoopwaarde van eigen producten en geboekt meerwerk. Creditnota’s en correcties zijn verwerkt. Marge en winst bekijk je in hun eigen tabblad.")}</p>
    <p className="mt-3 text-xs text-muted">{t("Alle bedragen ex. btw")}</p>
  </div>;
  return <div data-funding-summary>
    <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <div><p className="text-xs text-muted">{t("Ontvangen van klant")}</p><p data-funding-value="received" data-amount={cover.received} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.received)}</p><p className="mt-1 text-xs text-muted">{t("Alleen geboekte betalingen · ex. btw")}</p></div>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">−</span>
      <div><p className="text-xs text-muted">{t("Geboekt werk tegen klantprijs")}</p><p data-funding-value="work" data-amount={cover.requiredRevenue} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.requiredRevenue)}</p><p className="mt-1 text-xs text-muted">{t("Incl. opslag, eigen producten en meerwerk · ex. btw")}</p></div>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">=</span>
      <div><p className="text-xs text-muted">{t("Resterende voorschotruimte")}</p><p data-funding-value="remaining" data-amount={cover.saldo} className={`mt-1 text-2xl font-semibold tabular-nums ${cover.saldo < 0 ? "text-danger" : cover.tone === "warning" ? "text-warning" : "text-success"}`}>{formatEUR(cover.saldo)}</p><p className="mt-1 text-xs text-muted">{cover.saldo < 0 ? t("Ontbreekt voor het geboekte werk · ex. btw") : t("Vooruit ontvangen voor volgend werk · ex. btw")}</p></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-relaxed text-muted">{t("Ontvangen − geboekt werk tegen klantprijs = resterende voorschotruimte.")}</p>
      {details === "dialog" && <ActionDialog title={t("Van kosten naar klantprijs")} trigger={t("Kosten en berekening bekijken")}>{breakdown}</ActionDialog>}
    </div>
    {details === "inline" && <div className="mt-5 rounded-xl border bg-background/40 p-4">{breakdown}</div>}
  </div>;
}
