import { maakT, type Locale } from '@/lib/i18n';
import type { ReportPdfInput } from '@/lib/report-pdf';

/** Translate generated labels only; customer names, notes and amounts are preserved. */
export function localizeReportInput(input: ReportPdfInput, locale: Locale): ReportPdfInput {
  const t = maakT(locale);
  const label = (value: string | undefined) => value?.split('\n').map(line => t(line)).join('\n');
  return {
    ...input,
    locale,
    title: t(input.title),
    subtitle: label(input.subtitle),
    kpis: input.kpis.map(kpi => ({ ...kpi, label: t(kpi.label), hint: label(kpi.hint) })),
    tables: input.tables.map(table => ({ ...table, title: t(table.title), subtitle: label(table.subtitle),
      columns: table.columns.map(column => ({ ...column, header: t(column.header) })), emptyText: label(table.emptyText) })),
  };
}
