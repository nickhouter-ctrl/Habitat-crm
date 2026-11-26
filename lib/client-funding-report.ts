import { maakT, type Locale } from "@/lib/i18n";
import type { AdvanceCover, ProjectMargins } from "@/lib/project-financials";
import type { ReportPdfInput, ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";
import type { ClientFundingProduct } from "./client-funding-products";
import { receiptExVat, type ReceiptLike } from "./receipts";
import type { ClientWorkRow } from "./client-funding-work";

export type ClientPaymentLike = ReceiptLike & { date?: string | null; docNumber?: string | null };
export type ClientFundingPayment = { date: string | null; documentNumber: string | null; method: string; gross: number; vat: number; net: number };

const cents = (n: number) => Math.round(n * 100);

/** Every receipt on its own row, oldest first; amounts as the balance counts them. */
export function clientFundingPayments(payments: ClientPaymentLike[]): ClientFundingPayment[] {
  return payments.map(p => {
    const gross = cents(Number(p.amountEur ?? 0)) / 100;
    const net = cents(receiptExVat(p)) / 100;
    return { date: p.date ? String(p.date).slice(0, 10) : null, documentNumber: p.docNumber ?? null, method: p.method, gross, net, vat: (cents(gross) - cents(net)) / 100 };
  }).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** Explicit customer-facing projection: never pass costs, notes or profit to the PDF. */
export function clientFundingAmounts(
  cover: Pick<AdvanceCover, "totalReceived" | "ownProductReceived" | "requiredRevenue" | "saldo" | "advanceCredit" | "advanceCreditDescription">,
  margins: Pick<ProjectMargins, "laborRevenue" | "purchaseRevenue" | "otherRevenue">,
) {
  return {
    received: cover.totalReceived,
    products: cover.ownProductReceived,
    work: cover.requiredRevenue,
    advanceCredit: cover.advanceCredit,
    advanceCreditDescription: cover.advanceCreditDescription,
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
  products?: ClientFundingProduct[];
  payments?: ClientFundingPayment[];
  work?: ClientWorkRow[];
}): ReportPdfInput {
  const { amounts: a, locale } = input;
  const t = maakT(locale);
  if (input.products && input.products.reduce((sum, p) => sum + Math.round(p.received * 100), 0) !== Math.round(a.products * 100)) {
    throw new Error("Product specification does not reconcile with the project balance");
  }
  const payments = input.payments ?? [];
  if (payments.length && payments.reduce((sum, p) => sum + cents(p.net), 0) !== cents(a.received)) {
    throw new Error("Payment list does not reconcile with the project balance");
  }
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const paymentLabel = (p: ClientFundingPayment) => p.documentNumber ? t("Factuur {n}", { n: p.documentNumber })
    : t(p.method === "cash" ? "Contante betaling" : p.method === "advance" ? "Voorschot" : p.method === "bank" ? "Bankbetaling" : "Betaling");
  const paymentRows = payments.map(p => [p.date ? dateFmt.format(new Date(`${p.date}T00:00:00Z`)) : "-", paymentLabel(p),
    formatEUR(p.gross), formatEUR(p.vat), formatEUR(p.net)]);
  const totalGross = payments.reduce((sum, p) => sum + cents(p.gross), 0) / 100;
  const paymentTables: ReportTable[] = Array.from({ length: Math.ceil(paymentRows.length / 12) }, (_, i) => {
    const rows = paymentRows.slice(i * 12, (i + 1) * 12);
    const last = (i + 1) * 12 >= paymentRows.length;
    return {
      title: t(i === 0 ? "Ontvangen betalingen op datum" : "Ontvangen betalingen op datum (vervolg)"),
      subtitle: t("Alle verwerkte betalingen van oud naar nieuw. Contante betalingen en losse voorschotten zijn zonder btw; deze worden bij de eindafrekening verrekend."),
      columns: [{ header: t("Datum"), flex: 1.2 }, { header: t("Omschrijving"), flex: 2.6 }, { header: t("Incl. btw"), flex: 1.3, align: "right" },
        { header: t("Btw"), flex: 1.1, align: "right" }, { header: t("Ex. btw"), flex: 1.3, align: "right" }],
      rows: [...rows, ...(last ? [[t("Totaal ontvangen"), "", formatEUR(totalGross), formatEUR((cents(totalGross) - cents(a.received)) / 100), formatEUR(a.received)]] : [])],
      emphasizeRow: row => last && row === rows.length,
    };
  });
  const work = input.work ?? [];
  if (work.length && work.reduce((sum, r) => sum + cents(r.amount), 0) !== cents(a.work)) {
    throw new Error("Work list does not reconcile with the project balance");
  }
  const workKind = { labor: t("Arbeid (week)"), laborInvoice: t("Arbeid"), material: t("Bouwmaterialen"), other: t("Overige") };
  const workRows = work.map(r => [
    r.date ? dateFmt.format(new Date(`${r.date}T00:00:00Z`)) : "-",
    r.description,
    workKind[r.kind], formatEUR(r.amount),
  ]);
  const workTables: ReportTable[] = Array.from({ length: Math.ceil(workRows.length / 25) }, (_, i) => {
    const rows = workRows.slice(i * 25, (i + 1) * 25);
    const last = (i + 1) * 25 >= workRows.length;
    return {
      title: t(i === 0 ? "Afgeboekt werk per factuur en week" : "Afgeboekt werk per factuur en week (vervolg)"),
      subtitle: i === 0 ? t("Alle facturen en gewerkte weken van oud naar nieuw, ex. btw, zoals afgeboekt op uw project. Arbeid staat per week per ploeg.") : undefined,
      columns: [{ header: t("Datum"), flex: 1.1 }, { header: t("Omschrijving"), flex: 4 }, { header: t("Soort"), flex: 1.4 }, { header: t("Bedrag"), flex: 1.3, align: "right" }],
      rows: [...rows, ...(last ? [["", t("Totaal afgeboekt werk"), "", formatEUR(a.work)]] : [])],
      emphasizeRow: row => last && row === rows.length,
    };
  });
  const columns = [{ header: t("Omschrijving"), flex: 4 }, { header: t("Bedrag"), align: "right" as const, flex: 1.5 }];
  const receipts = input.products ?? [];
  const productRows = receipts.map(p => [
    p.documentNumber ?? t("Betaling"),
    p.specifications?.length
      ? t("Productregels van {facturen}", { facturen: [...new Set(p.specifications.map(d => d.documentNumber ?? t("Factuur")))].join(", ") })
      : p.products.join(" · ") || t("Producten volgens factuur of verrekening"),
    formatEUR(p.received),
  ]);
  const productTables: ReportTable[] = Array.from({ length: Math.ceil(productRows.length / 10) }, (_, i) => {
    const rows = productRows.slice(i * 10, (i + 1) * 10);
    const last = (i + 1) * 10 >= productRows.length;
    return {
      title: t(i === 0 ? "Specificatie van de productbedragen" : "Specificatie van de productbedragen (vervolg)"),
      subtitle: t("Ontvangen productbedrag per factuur, ex. btw. Bij deelbetalingen telt alleen het betaalde deel mee. Deze bedragen zijn hierboven al afgetrokken."),
      columns: [{ header: t("Factuur"), flex: 1.5 }, { header: t("Producten"), flex: 4 }, { header: t("Bedrag"), flex: 1.5, align: "right" }],
      rows: [...rows, ...(last ? [[t("Totaal"), "", formatEUR(a.products)]] : [])],
      emphasizeRow: row => last && row === rows.length,
    };
  });
  // An advance and its final invoice can refer to the same goods. Show their
  // receipt allocations above, but the underlying invoice lines only once.
  // IDs, not invoice numbers: external suppliers can reuse the same number.
  const specifications = new Map(receipts.flatMap(p => p.specifications ?? []).map(d => [d.documentId, d]));
  const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  for (const spec of specifications.values()) {
    const total = spec.items.reduce((sum, it) => sum + Math.round(it.total * 100), 0) / 100;
    for (let start = 0; start < spec.items.length; start += 10) {
      const items = spec.items.slice(start, start + 10);
      const last = start + 10 >= spec.items.length;
      productTables.push({
        title: t(start === 0 ? "Productregels - {factuur}" : "Productregels - {factuur} (vervolg)", { factuur: spec.documentNumber ?? t("Factuur") }),
        subtitle: t("Factuurbedragen per product, ex. btw, na eventuele korting. Het ontvangen deel staat in het overzicht hierboven. Productregels worden één keer getoond en niet opnieuw afgetrokken."),
        columns: [{ header: t("Product"), flex: 3.2 }, { header: t("Aantal"), flex: 0.65, align: "right" },
          { header: t("Per eenheid"), flex: 1.15, align: "right" }, { header: t("Totaal ex. btw"), flex: 1.2, align: "right" }],
        rows: [...items.map(it => [it.name, quantity.format(it.quantity), formatEUR(it.unitPrice), formatEUR(it.total)]),
          ...(last ? [[t("Totaal producten op factuur"), "", "", formatEUR(total)]] : [])],
        emphasizeRow: row => last && row === items.length,
      });
    }
  }
  return {
    locale,
    typography: "readable",
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
          ...(a.advanceCredit > 0 ? [[t(a.advanceCreditDescription ?? "Tegoed toegevoegd aan voorschotruimte"), `+ ${formatEUR(a.advanceCredit)}`]] : []),
          [t("Resterend voorschot"), formatEUR(a.remaining)],
        ],
        emphasizeRow: i => i === (a.advanceCredit > 0 ? 4 : 3),
      },
      ...paymentTables,
      ...productTables,
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
      ...workTables,
      {
        title: t("Toelichting"),
        columns: [{ header: "", flex: 1 }],
        rows: [
          [t("Productbedragen blijven bestemd voor de betreffende producten en zijn niet beschikbaar voor verdere werkzaamheden.")],
          ...(a.advanceCredit > 0 ? [[t("Een apart tegoed is toegevoegd aan de voorschotruimte. Dit is geen nieuwe betaling.")]] : []),
          [t(a.remaining < 0
            ? "Het afgeboekte werk overschrijdt het beschikbare voorschot. Het bedrag 'Nog aan te vullen' is het tekort op deze peildatum."
            : "Het resterende voorschot is beschikbaar voor verdere werkzaamheden.")],
          [t("Dit is een tussenstand op basis van verwerkte betalingen en afgeboekt werk op de datum van dit overzicht. Nog niet verwerkte werkzaamheden en betalingen zijn niet opgenomen. Dit overzicht is geen factuur of eindafrekening.")],
        ],
      },
    ],
  };
}
