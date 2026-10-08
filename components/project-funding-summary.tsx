import { FinancialInspect } from "./project-financial-details";
import { tekst } from "@/lib/i18n/server";
import { projectWorkProfit, type AdvanceCover, type ProjectMargins } from "@/lib/project-financials";
import { formatEUR } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";

/** Received goods payments stay separate from funding for labour and third parties. */
export async function ProjectFundingSummary({ cover, ownProducts, details = "dialog" }: {
  cover: AdvanceCover; ownProducts: Pick<ProjectMargins, "productMargin" | "uncostedProductRevenue">; details?: "dialog" | "inline";
}) {
  const t = await tekst();
  const markup = projectWorkProfit(cover);
  const totalGrossProfit = Math.round((markup + ownProducts.productMargin) * 100) / 100;
  const breakdown = <div data-funding-breakdown>
    <dl className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Geboekte werkkosten")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.prefinanced)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Berekende brutowinst op uitgevoerd werk")}</dt><dd className="font-medium tabular-nums">{formatEUR(markup)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><dt>{t("Uren en derden tegen klantprijs")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.requiredRevenue)}</dd></div>
      {cover.ownProductPrefinanced > 0 && <div className="flex flex-wrap justify-between gap-2"><dt>{t("Eigen producten betaald, nog niet ontvangen")}</dt><dd className="font-medium tabular-nums">− {formatEUR(cover.ownProductPrefinanced)}</dd></div>}
      {cover.advanceCredit > 0 && <div className="flex flex-wrap justify-between gap-2"><dt>{t("Tegoed toegevoegd aan voorschotruimte")}</dt><dd className="font-medium tabular-nums">+ {formatEUR(cover.advanceCredit)}</dd></div>}
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Resterende voorschotruimte")}</dt><dd className="font-semibold tabular-nums">{formatEUR(cover.saldo)}</dd></div>
    </dl>
    <p className="mt-4 text-sm leading-relaxed text-muted">{t("Verkoopontvangsten voor alle eigen producten blijven buiten het werkgeld. Van het werkgeld trekken we de geboekte werkkosten af en houden we de berekende brutowinst apart. Wat overblijft is beschikbaar voor projectkosten.")}</p>
    {cover.advanceCredit > 0 && <p className="mt-3 text-sm leading-relaxed text-muted">{t("Dit tegoed verhoogt de voorschotruimte en is geen nieuwe betaling.")}</p>}
    {cover.ownProductPrefinanced > 0 && <p className="mt-3 text-sm leading-relaxed text-muted">{t("Eigen producten die wij al betaalden en de klant nog niet, zijn ook voorgeschoten. Die kostprijs gaat van de voorschotruimte af tot de klant ervoor betaalt.")}</p>}
    <p className="mt-3 text-xs text-muted">{t("Alle bedragen ex. btw")}</p>
  </div>;
  return <div data-funding-summary>
    <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <FinancialInspect detail="total-received" label={t("Totaal ontvangen")}><p className="text-xs text-muted">{t("Totaal ontvangen")}</p><p data-funding-value="total-received" data-amount={cover.totalReceived} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.totalReceived)}</p></FinancialInspect>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">−</span>
      <FinancialInspect detail="own-products" label={t("Ontvangen voor eigen producten")}><p className="text-xs text-muted">{t("Ontvangen voor eigen producten")}</p><p data-funding-value="own-products" data-amount={cover.ownProductReceived} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.ownProductReceived)}</p><p className="mt-1 text-xs text-muted">{t("Volledige ontvangen verkoopprijs, inclusief productwinst")}</p></FinancialInspect>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">=</span>
      <FinancialInspect detail="received" label={t("Liquide ontvangen")}><p className="text-xs text-muted">{t("Liquide ontvangen")}</p><p data-funding-value="received" data-amount={cover.received} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.received)}</p><p className="mt-1 text-xs text-muted">{t("Voor uren en inkopen bij derden")}</p></FinancialInspect>
    </div>
    <div className="mt-5 grid gap-4 rounded-xl border bg-background/40 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <FinancialInspect detail="work" label={t("Geboekte werkkosten")}><p className="text-xs text-muted">{t("Geboekte werkkosten")}</p><p data-funding-value="work" data-amount={cover.prefinanced} className="mt-1 text-xl font-semibold tabular-nums">{formatEUR(cover.prefinanced)}</p><p className="mt-1 text-xs text-muted">{t("Uren, bouwmaterialen en overige projectkosten")}</p></FinancialInspect>
      <FinancialInspect detail="work-profit" label={t("Brutowinst op uitgevoerd werk")}><p className="text-xs text-muted">{t("Brutowinst op uitgevoerd werk")}</p><p data-funding-value="work-profit" data-amount={markup} className={`mt-1 text-2xl font-semibold tabular-nums ${markup < 0 ? "text-danger" : "text-success"}`}>{formatEUR(markup)}</p><p className="mt-1 text-xs text-muted">{t("Opslag op uren, bouwmaterialen en overige kosten. Zonder winst op eigen producten.")}</p></FinancialInspect>
      <FinancialInspect detail="own-product-profit" label={t("Brutowinst eigen producten")}><p className="text-xs text-muted">{t("Brutowinst eigen producten")}</p><p data-funding-value="own-product-profit" data-amount={ownProducts.productMargin} className={`mt-1 text-2xl font-semibold tabular-nums ${ownProducts.productMargin < 0 ? "text-danger" : "text-success"}`}>{formatEUR(ownProducts.productMargin)}</p><p className="mt-1 text-xs text-muted">{t("Verkoop eigen producten min bekende kostprijs")}</p>{ownProducts.uncostedProductRevenue !== 0 && <FinancialInspect detail="uncosted-products" label={t("Omzet zonder gekoppelde kostprijs")} className="z-10"><p data-funding-uncosted data-amount={ownProducts.uncostedProductRevenue} className="mt-1 text-xs text-warning">{t(" {amount} omzet heeft nog geen gekoppelde kostprijs; hiervoor is geen brutowinst berekend.", { amount: formatEUR(ownProducts.uncostedProductRevenue) })}</p></FinancialInspect>}</FinancialInspect>
      <FinancialInspect detail="advance-remaining" label={t("Resterende voorschotruimte")}><p className="text-xs text-muted">{t("Resterende voorschotruimte")}</p><p data-funding-value="advance-remaining" data-amount={cover.saldo} className={`mt-1 text-2xl font-semibold tabular-nums ${cover.saldo < 0 ? "text-danger" : cover.tone === "warning" ? "text-warning" : "text-success"}`}>{formatEUR(cover.saldo)}</p><p className="mt-1 text-xs text-muted">{t(cover.ownProductPrefinanced > 0 ? "Werkgeld min geboekte kosten, apart gehouden brutowinst en voorgeschoten eigen producten" : "Werkgeld min geboekte kosten en apart gehouden brutowinst")}</p></FinancialInspect>
      <FinancialInspect detail="total-gross-profit" label={t("Totaal brutowinst")} className="border-t pt-4 sm:col-span-2 xl:col-start-2"><p className="text-xs text-muted">{t("Totaal brutowinst")}</p><p data-funding-value="total-gross-profit" data-amount={totalGrossProfit} className={`mt-1 text-2xl font-semibold tabular-nums ${totalGrossProfit < 0 ? "text-danger" : "text-success"}`}>{formatEUR(totalGrossProfit)}</p><p className="mt-1 text-xs text-muted">{t("Brutowinst op werk + brutowinst eigen producten, op basis van gekoppelde kostprijzen")}</p></FinancialInspect>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-xs leading-relaxed text-muted">{t("De brutowinst komt uit de ingestelde opslag op uren, bouwmaterialen en overige projectkosten. Winst op eigen producten staat apart. Algemene bedrijfskosten zijn nog niet afgetrokken. Alle bedragen ex. btw, op basis van geboekte betalingen en kosten.")}</p>
      {details === "dialog" && <ActionDialog title={t("Berekening voorschotruimte")} trigger={t("Kosten en berekening bekijken")}>{breakdown}</ActionDialog>}
    </div>
    {details === "inline" && <div className="mt-5 rounded-xl border bg-background/40 p-4">{breakdown}</div>}
  </div>;
}
