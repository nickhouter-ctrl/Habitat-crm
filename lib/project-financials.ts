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

/* ─────────────── Marge per stroom: uren, eigen producten, inkoop ─────────────── */

/** Standaard marge op gewerkte uren, als percentage VAN DE VERKOOPPRIJS. */
export const DEFAULT_LABOR_MARGIN_PCT = 15;

/** Idem voor inkoop bij derden — die wordt met opslag doorbelast, niet tegen kostprijs. */
export const DEFAULT_PURCHASE_MARGIN_PCT = 15;

export type ProjectMargins = {
  /* Uren — normatief: er is geen aparte verkoopprijs per uur, dus we rekenen met
     een vaste marge-norm op de kostprijs. */
  laborMarginPct: number;
  laborCost: number;
  /** Wat de uren moeten opbrengen: kost ÷ (1 − pct). */
  laborRevenue: number;
  laborMargin: number;

  /* Eigen producten — gemeten: echte verkoopprijs minus echte kostprijs op de
     facturen. Dit is de marge waar je zelf over gaat. */
  productRevenue: number;
  productCost: number;
  productMargin: number;
  productMarginPct: number | null;
  /** Gefactureerde productomzet zonder bekende kostprijs — valt buiten de meting. */
  uncostedProductRevenue: number;

  /* Inkoop derden — normatief, net als de uren: wat we inkopen belasten we door
     met opslag, niet tegen kostprijs. */
  purchaseMarginPct: number;
  purchaseCost: number;
  /** Wat de inkoop moet opbrengen: kost ÷ (1 − pct). */
  purchaseRevenue: number;
  purchaseMargin: number;

  /* Totalen */
  /** Alles bij elkaar door te belasten: uren + inkoop + gefactureerde producten. */
  totalRevenue: number;
  /** De drie marges samen. */
  totalMargin: number;

  /** Totale kosten (uren + inkoop + kostprijs eigen producten). */
  costToDate: number;
};

/**
 * Marge per stroom, elk op zijn eigen manier gemeten:
 *
 * - **Uren**: normatief. Een uur heeft geen eigen verkoopprijs, dus we hanteren
 *   een norm (`laborMarginPct`, marge ÷ verkoopprijs) en leiden de verkoopwaarde
 *   daaruit af.
 * - **Eigen producten**: gemeten. Verkoopprijs en kostprijs staan allebei op de
 *   factuurregel, dus dit is de echte marge — geen aanname.
 * - **Inkoop derden**: normatief. Wat we bij derden inkopen belasten we door met
 *   opslag (`purchaseMarginPct`), net als de uren — niet tegen kostprijs.
 *
 * Bewust GEEN restpost-marge tegen de aanneemprijs: die prijs dekt de hele klus
 * (uren, inkoop, producten samen), dus "doel − uren = ruimte voor materiaal"
 * geeft op een pas begonnen project een onzinnig hoog percentage.
 *
 * `totalRevenue` is wat de klus tot nu toe minimaal moet opbrengen om alle drie
 * de marges te halen — vergelijk dat met de aanneemprijs om te zien of je goed
 * zit.
 */
export function deriveProjectMargins(i: {
  laborCost: number;
  /** null/undefined → {@link DEFAULT_LABOR_MARGIN_PCT}. */
  laborMarginPct?: number | null;
  productRevenue: number;
  productCost: number;
  uncostedProductRevenue?: number;
  /** Inkooporders (ex. btw) + losse projectkosten. */
  purchaseCost: number;
  /** null/undefined → {@link DEFAULT_PURCHASE_MARGIN_PCT}. */
  purchaseMarginPct?: number | null;
}): ProjectMargins {
  // Boven de 100% zou de deling ontploffen; onder 0 is er geen marge-norm.
  const laborPct = clampPct(i.laborMarginPct ?? DEFAULT_LABOR_MARGIN_PCT);
  const purchasePct = clampPct(i.purchaseMarginPct ?? DEFAULT_PURCHASE_MARGIN_PCT);
  const laborRevenue = round2(i.laborCost / (1 - laborPct / 100));
  const purchaseRevenue = round2(i.purchaseCost / (1 - purchasePct / 100));
  const laborMargin = round2(laborRevenue - i.laborCost);
  const purchaseMargin = round2(purchaseRevenue - i.purchaseCost);
  const productMargin = round2(i.productRevenue - i.productCost);

  return {
    laborMarginPct: laborPct,
    laborCost: i.laborCost,
    laborRevenue,
    laborMargin,
    productRevenue: i.productRevenue,
    productCost: i.productCost,
    productMargin,
    productMarginPct: i.productRevenue > 0 ? Math.round((productMargin / i.productRevenue) * 1000) / 10 : null,
    uncostedProductRevenue: i.uncostedProductRevenue ?? 0,
    purchaseMarginPct: purchasePct,
    purchaseCost: i.purchaseCost,
    purchaseRevenue,
    purchaseMargin,
    totalRevenue: round2(laborRevenue + purchaseRevenue + i.productRevenue),
    totalMargin: round2(laborMargin + purchaseMargin + productMargin),
    costToDate: round2(i.laborCost + i.purchaseCost + i.productCost),
  };
}

function clampPct(n: number): number {
  return Math.min(95, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
