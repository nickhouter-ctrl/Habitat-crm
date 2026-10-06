import { tekst } from "@/lib/i18n/server";
import { projectWorkProfit, type AdvanceCover } from "@/lib/project-financials";
import { formatEUR } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";

/** Received goods payments stay separate from funding for labour and third parties. */
export async function ProjectFundingSummary({ cover, details = "dialog" }: {
  cover: AdvanceCover; details?: "dialog" | "inline";
}) {
  const t = await tekst();
  const markup = projectWorkProfit(cover);
  const breakdown = <div data-funding-breakdown>
    <dl className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Geboekte werkkosten")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.prefinanced)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Berekende brutowinst op uitgevoerd werk")}</dt><dd className="font-medium tabular-nums">{formatEUR(markup)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><dt>{t("Uren en derden tegen klantprijs")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.requiredRevenue)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Resterende voorschotruimte")}</dt><dd className="font-semibold tabular-nums">{formatEUR(cover.saldo)}</dd></div>
    </dl>
    <p className="mt-4 text-sm leading-relaxed text-muted">{t("Verkoopontvangsten voor alle eigen producten blijven buiten het werkgeld. Van het werkgeld trekken we de geboekte werkkosten af en houden we de berekende brutowinst apart. Wat overblijft is beschikbaar voor projectkosten.")}</p>
    <p className="mt-3 text-xs text-muted">{t("Alle bedragen ex. btw")}</p>
  </div>;
  return <div data-funding-summary>
    <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <div><p className="text-xs text-muted">{t("Totaal ontvangen")}</p><p data-funding-value="total-received" data-amount={cover.totalReceived} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.totalReceived)}</p></div>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">−</span>
      <div><p className="text-xs text-muted">{t("Ontvangen voor eigen producten")}</p><p data-funding-value="own-products" data-amount={cover.ownProductReceived} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.ownProductReceived)}</p><p className="mt-1 text-xs text-muted">{t("Volledige ontvangen verkoopprijs, inclusief productwinst")}</p></div>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">=</span>
      <div><p className="text-xs text-muted">{t("Liquide ontvangen")}</p><p data-funding-value="received" data-amount={cover.received} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.received)}</p><p className="mt-1 text-xs text-muted">{t("Voor uren en inkopen bij derden")}</p></div>
    </div>
    <div className="mt-5 grid gap-4 rounded-xl border bg-background/40 p-4 sm:grid-cols-3">
      <div><p className="text-xs text-muted">{t("Geboekte werkkosten")}</p><p data-funding-value="work" data-amount={cover.prefinanced} className="mt-1 text-xl font-semibold tabular-nums">{formatEUR(cover.prefinanced)}</p><p className="mt-1 text-xs text-muted">{t("Uren, bouwmaterialen en overige projectkosten")}</p></div>
      <div><p className="text-xs text-muted">{t("Brutowinst op uitgevoerd werk")}</p><p data-funding-value="work-profit" data-amount={markup} className={`mt-1 text-2xl font-semibold tabular-nums ${markup < 0 ? "text-danger" : "text-success"}`}>{formatEUR(markup)}</p><p className="mt-1 text-xs text-muted">{t("Opslag op uren, bouwmaterialen en overige kosten. Zonder winst op eigen producten.")}</p></div>
      <div><p className="text-xs text-muted">{t("Resterende voorschotruimte")}</p><p data-funding-value="advance-remaining" data-amount={cover.saldo} className={`mt-1 text-2xl font-semibold tabular-nums ${cover.saldo < 0 ? "text-danger" : cover.tone === "warning" ? "text-warning" : "text-success"}`}>{formatEUR(cover.saldo)}</p><p className="mt-1 text-xs text-muted">{t("Werkgeld min geboekte kosten en apart gehouden brutowinst")}</p></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-xs leading-relaxed text-muted">{t("De brutowinst komt uit de ingestelde opslag op uren, bouwmaterialen en overige projectkosten. Winst op eigen producten staat apart. Algemene bedrijfskosten zijn nog niet afgetrokken. Alle bedragen ex. btw, op basis van geboekte betalingen en kosten.")}</p>
      {details === "dialog" && <ActionDialog title={t("Berekening voorschotruimte")} trigger={t("Kosten en berekening bekijken")}>{breakdown}</ActionDialog>}
    </div>
    {details === "inline" && <div className="mt-5 rounded-xl border bg-background/40 p-4">{breakdown}</div>}
  </div>;
}
