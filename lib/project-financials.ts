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

/* ─────────────── Voorschotdekking: schieten wij geld voor? ─────────────── */

/**
 * Onder deze buffer kleurt de dekking oranje: het saldo is nog net positief,
 * maar één weekje uren of één levering eet het op — tijd om het volgende
 * voorschot alvast voor te bereiden.
 */
export const ADVANCE_WARN_BUFFER_EUR = 2500;

export type AdvanceCoverInput = {
  /** Goedgekeurde uren × uurkost, ex. btw. */
  laborCost: number;
  /** Inkooporders bij derden (zonder countAsLabor) + losse projectkosten, ex. btw. */
  purchaseCost: number;
  /** Ontvangen dekking ex. btw — zie {@link deriveAdvanceCover} voor wat meetelt. */
  coverReceivedEx: number;
  /** Standaard {@link ADVANCE_WARN_BUFFER_EUR}. */
  warnBufferEur?: number;
};

export type AdvanceCover = {
  /** Wat wij tot nu toe uit eigen zak betaalden: uren + inkoop derden. */
  prefinanced: number;
  received: number;
  /** received − prefinanced; negatief = wij schieten voor. */
  saldo: number;
  status: "gedekt" | "bijna_op" | "voorgeschoten";
  tone: "success" | "warning" | "danger";
  /** Voorstel voor het volgende voorschot: tekort, omhoog afgerond op duizendtallen. */
  suggestedRequestEur: number;
};

/**
 * Voorschotdekking: lopen wij geld voor te schieten op deze klus?
 *
 * Aan de kostenkant tellen alleen échte kasuitgaven aan de klus: de uren van de
 * eigen ploeg en wat er bij derden (in Spanje) wordt ingekocht — inkooporders
 * plus losse projectkosten. **Eigen producten uit voorraad tellen niet mee**:
 * die liggen al op de plank en kosten op dat moment geen kasgeld; ze zijn een
 * eigen stroom met een eigen marge (zie {@link deriveProjectMargins}).
 * Meerwerk hoeft niet apart: meerwerk-uren en -inkoop stromen vanzelf mee via
 * laborCost/purchaseCost.
 *
 * Aan de ontvangstenkant telt alles wat er echt binnen is (ex. btw), mínus het
 * eigen-productdeel van betalingen die aan een factuur hangen — voorschotten
 * tellen dus helemaal mee, van een betaalde factuur telt alleen het deel dat
 * geen eigen producten is. Niet alleen `method='advance'`: een betaalde
 * deelfactuur voor uren/inkoop dekt het voorschieten net zo goed, anders zou je
 * geld vragen dat al binnen is.
 *
 * Alles ex. btw: de IVA op inkoop wordt teruggevorderd — dit is een
 * dekkingssom, geen kasboek.
 */
export function deriveAdvanceCover(i: AdvanceCoverInput): AdvanceCover {
  const buffer = i.warnBufferEur ?? ADVANCE_WARN_BUFFER_EUR;
  const prefinanced = round2(i.laborCost + i.purchaseCost);
  const received = round2(i.coverReceivedEx);
  const saldo = round2(received - prefinanced);
  const status: AdvanceCover["status"] = saldo < 0 ? "voorgeschoten" : saldo < buffer ? "bijna_op" : "gedekt";
  return {
    prefinanced,
    received,
    saldo,
    status,
    tone: status === "gedekt" ? "success" : status === "bijna_op" ? "warning" : "danger",
    // Een voorschot vraag je niet op de cent — zelfde afronding als de oude prefill.
    suggestedRequestEur: Math.max(0, Math.ceil(-saldo / 1000) * 1000),
  };
}

function clampPct(n: number): number {
  return Math.min(95, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
