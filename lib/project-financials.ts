/**
 * Afgeleide projectfinanciën (doel, kosten, verwacht resultaat, nog te factureren,
 * "op koers"). Pure functie — voedt zowel het projectdetail als de projectenlijst,
 * zodat beide exact dezelfde cijfers tonen. Alle bedragen ex. btw, behalve
 * `received` (ontvangsten staan incl. btw, net als op het detailscherm).
 */
export type ProjectFinancialsInput = {
  contractPriceEur: number | null;
  contingencyPct: number | null;
  /** Som van de begrotingsregels (targetprijs, ex. btw). */
  budgetBase: number;
  /** Som van de offerte-subtotalen (ex. btw). */
  estimateSubtotal: number;
  /** Gefactureerd: facturen − creditnota's, subtotaal ex. btw. */
  invoicedSubtotal: number;
  /** Ontvangen klantbetalingen (incl. btw). */
  received: number;
  laborCost: number;
  materialCost: number;
  /** Kostprijs eigen producten (verwacht = max van gefactureerd vs. offerte). */
  ownProductCost: number;
};

export type ProjectFinancials = {
  targetRevenue: number;
  targetIsImplicit: boolean;
  hasTarget: boolean;
  /** Werkelijke kosten tot nu toe (arbeid + inkoop + eigen producten gerealiseerd). */
  costToDate: number;
  /** Resultaat tot nu toe = doel − kosten tot nu toe. */
  resultToDate: number;
  marginPct: number | null;
  toInvoice: number;
  /** "op koers": success = goed, warning = krappe marge, danger = verlies. */
  tone: "success" | "warning" | "danger" | "neutral";
};

export function deriveProjectFinancials(i: ProjectFinancialsInput): ProjectFinancials {
  const contingencyPct = i.contingencyPct ?? 0;
  const budgetTargetTotal =
    i.budgetBase > 0 ? i.budgetBase + Math.round(i.budgetBase * (contingencyPct / 100) * 100) / 100 : 0;
  const explicitTarget =
    i.contractPriceEur ??
    (budgetTargetTotal > 0 ? budgetTargetTotal : i.estimateSubtotal > 0 ? i.estimateSubtotal : null);
  const targetRevenue = explicitTarget != null ? Math.max(explicitTarget, i.invoicedSubtotal) : i.invoicedSubtotal;
  const targetIsImplicit = explicitTarget == null;

  const costToDate = i.laborCost + i.materialCost + i.ownProductCost;
  const resultToDate = targetRevenue - costToDate;
  const marginPct = targetRevenue > 0 ? Math.round((resultToDate / targetRevenue) * 100) : null;
  const toInvoice = Math.max(0, targetRevenue - i.invoicedSubtotal - i.received);

  // Norm: minimaal 15% marge. "Op koers" alleen zinvol als er een doel én iets
  // gebeurd is (kosten of omzet).
  const MIN_MARGIN_PCT = 15;
  const meaningful = targetRevenue > 0 && (costToDate > 0 || i.invoicedSubtotal > 0 || i.received > 0);
  const tone: ProjectFinancials["tone"] = !meaningful
    ? "neutral"
    : resultToDate < 0
      ? "danger"
      : marginPct != null && marginPct < MIN_MARGIN_PCT
        ? "warning"
        : "success";

  return {
    targetRevenue,
    targetIsImplicit,
    hasTarget: explicitTarget != null,
    costToDate,
    resultToDate,
    marginPct,
    toInvoice,
    tone,
  };
}
