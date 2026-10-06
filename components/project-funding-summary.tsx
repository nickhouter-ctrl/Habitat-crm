import { tekst } from "@/lib/i18n/server";
import type { AdvanceCover } from "@/lib/project-financials";
import { formatEUR } from "@/lib/utils";
import { ActionDialog } from "./action-dialog";

/** Received goods payments stay separate from funding for labour and third parties. */
export async function ProjectFundingSummary({ cover, details = "dialog" }: {
  cover: AdvanceCover; details?: "dialog" | "inline";
}) {
  const t = await tekst();
  const markup = Math.round((cover.requiredRevenue - cover.prefinanced) * 100) / 100;
  const breakdown = <div data-funding-breakdown>
    <dl className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Geboekte kosten van uren en externe inkoop")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.prefinanced)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Berekende brutowinst op uren en inkoop")}</dt><dd className="font-medium tabular-nums">{formatEUR(markup)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 border-t pt-3"><dt>{t("Uren en derden tegen klantprijs")}</dt><dd className="font-medium tabular-nums">{formatEUR(cover.requiredRevenue)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>{t("Voorschot voor volgend werk")}</dt><dd className="font-semibold tabular-nums">{formatEUR(cover.saldo)}</dd></div>
    </dl>
    <p className="mt-4 text-sm leading-relaxed text-muted">{t("Van het ontvangen geld voor uren en inkopen bij derden trekken we de geboekte kosten en de berekende brutowinst af. Het restant is het voorschot voor volgend werk. Betalingen en winst op eigen producten staan apart.")}</p>
    <p className="mt-3 text-xs text-muted">{t("Alle bedragen ex. btw")}</p>
  </div>;
  return <div data-funding-summary>
    <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <div><p className="text-xs text-muted">{t("Totaal ontvangen")}</p><p data-funding-value="total-received" data-amount={cover.totalReceived} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.totalReceived)}</p></div>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">−</span>
      <div><p className="text-xs text-muted">{t("Ontvangen voor eigen producten")}</p><p data-funding-value="own-products" data-amount={cover.ownProductReceived} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.ownProductReceived)}</p><p className="mt-1 text-xs text-muted">{t("Apart gehouden voor eigen producten")}</p></div>
      <span aria-hidden="true" className="hidden pt-6 text-2xl text-muted sm:block">=</span>
      <div><p className="text-xs text-muted">{t("Liquide ontvangen")}</p><p data-funding-value="received" data-amount={cover.received} className="mt-1 text-2xl font-semibold tabular-nums">{formatEUR(cover.received)}</p><p className="mt-1 text-xs text-muted">{t("Voor uren en inkopen bij derden")}</p></div>
    </div>
    <div className="mt-5 grid gap-4 rounded-xl border bg-background/40 p-4 sm:grid-cols-3">
      <div><p className="text-xs text-muted">{t("Geboekte kosten van uren en externe inkoop")}</p><p data-funding-value="work" data-amount={cover.prefinanced} className="mt-1 text-xl font-semibold tabular-nums">{formatEUR(cover.prefinanced)}</p></div>
      <div><p className="text-xs text-muted">{t("Over na geboekte kosten")}</p><p data-funding-value="remaining" data-amount={cover.costSaldo} className={`mt-1 text-2xl font-semibold tabular-nums ${cover.costSaldo < 0 ? "text-danger" : "text-success"}`}>{formatEUR(cover.costSaldo)}</p><p className="mt-1 text-xs text-muted">{t("Berekende brutowinst op uren en inkoop: {amount}.", { amount: formatEUR(markup) })}</p></div>
      <div><p className="text-xs text-muted">{t("Voorschot voor volgend werk")}</p><p data-funding-value="advance-remaining" data-amount={cover.saldo} className={`mt-1 text-2xl font-semibold tabular-nums ${cover.saldo < 0 ? "text-danger" : cover.tone === "warning" ? "text-warning" : "text-success"}`}>{formatEUR(cover.saldo)}</p><p className="mt-1 text-xs text-muted">{t("Na aftrek van kosten en berekende brutowinst")}</p></div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-xs leading-relaxed text-muted">{t("De brutowinst komt uit de opslag op uren en inkoop. Algemene bedrijfskosten zijn daar nog niet vanaf. Alle bedragen ex. btw, op basis van geboekte betalingen en kosten.")}</p>
      {details === "dialog" && <ActionDialog title={t("Berekening voorschotruimte")} trigger={t("Kosten en berekening bekijken")}>{breakdown}</ActionDialog>}
    </div>
    {details === "inline" && <div className="mt-5 rounded-xl border bg-background/40 p-4">{breakdown}</div>}
  </div>;
}
