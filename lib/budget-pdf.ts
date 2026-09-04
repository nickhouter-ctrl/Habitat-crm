/* Bouwt de klant-begroting-PDF (per fase, targetprijzen, zonder interne kost/marge).
 * Gedeeld door de print-route en de "versturen naar klant"-actie. */
import "server-only";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectBudgetLines, projectPhases, projects } from "@/lib/db/schema";
import {
  amountEur,
  amountTableColumns,
  getPdfContact,
  pdfDateStamp,
  phaseKey,
  sumAmountEur,
  type ClientPdf,
} from "@/lib/pdf-shared";
import { renderReportPdf, type ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

const CAT_LABEL: Record<string, string> = {
  labor: "Arbeid",
  material: "Materiaal",
  subcontractor: "Onderaanneming",
  equipment: "Materieel",
  other: "Overig",
};

/** Resultaat van {@link renderBudgetPdf} — zie {@link ClientPdf}. */
export type BudgetPdf = ClientPdf;

export async function renderBudgetPdf(projectId: string): Promise<BudgetPdf | null> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return null;

  const [lines, phaseRows] = await Promise.all([
    db
      .select()
      .from(projectBudgetLines)
      .where(eq(projectBudgetLines.projectId, projectId))
      .orderBy(asc(projectBudgetLines.sortOrder), asc(projectBudgetLines.createdAt)),
    db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.sortOrder)),
  ]);

  const phaseNames = phaseRows.map((p) => p.name);
  const linesOf = (key: string) => lines.filter((l) => phaseKey(l.phase) === key);

  const lineLabel = (l: (typeof lines)[number]) => {
    const sub: string[] = [];
    if (l.section) sub.push(l.section);
    if (l.quantity && l.unitPriceEur)
      sub.push(`${amountEur(l.quantity).toLocaleString("nl-NL")} × ${formatEUR(l.unitPriceEur)}`);
    else sub.push(CAT_LABEL[l.category] ?? l.category);
    if (l.isStelpost) sub.push("stelpost");
    return `${l.description}  ·  ${sub.join(" · ")}`;
  };

  const tables: ReportTable[] = [];
  const sectionFor = (title: string, subtitle: string | undefined, grp: typeof lines) => {
    const subtotal = sumAmountEur(grp);
    const hasPrices = subtotal > 0;
    // Prijs alleen tonen als die er is; anders is de regel pure uitleg (bestek).
    const rows = grp.map((l) => [lineLabel(l), amountEur(l.amountEur) > 0 ? formatEUR(l.amountEur) : ""]);
    if (hasPrices) rows.push(["Subtotaal", formatEUR(subtotal)]);
    tables.push({
      title,
      subtitle,
      columns: amountTableColumns("Onderdeel", hasPrices ? "Bedrag" : ""),
      rows,
      emphasizeRow: (i) => hasPrices && i === rows.length - 1,
    });
  };
  // Eén sectie per fase (in volgorde) — óók als er nog geen onderdelen zijn,
  // dan toont 'ie alleen de fase-uitleg (bestek).
  for (const ph of phaseRows) {
    const subtitle = [ph.description, ph.plannedWeeks].filter(Boolean).join("\n") || undefined;
    sectionFor(ph.name, subtitle, linesOf(ph.name));
  }
  // Onderdelen zonder (gekende) fase.
  const ungrouped = lines.filter((l) => !phaseNames.includes(phaseKey(l.phase)));
  if (ungrouped.length > 0) sectionFor("Werkzaamheden", undefined, ungrouped);

  const base = sumAmountEur(lines);
  const pct = amountEur(project.contingencyPct);
  const contingency = pct > 0 ? Math.round(base * (pct / 100) * 100) / 100 : 0;
  const contract = amountEur(project.contractPriceEur);
  // Met regelprijzen: subtotaal (+onvoorzien). Geen regelprijzen maar wél een
  // afgesproken aanneemprijs: toon die als totaal. Anders: geen totaalblok (puur bestek).
  if (base > 0) {
    const totalRows: string[][] = [["Subtotaal werkzaamheden", formatEUR(base)]];
    if (contingency > 0) totalRows.push([`Onvoorzien (${pct}%)`, formatEUR(contingency)]);
    totalRows.push(["Totaal (excl. BTW)", formatEUR(base + contingency)]);
    tables.push({
      title: "Totaal",
      columns: amountTableColumns(),
      rows: totalRows,
      emphasizeRow: (i) => i === totalRows.length - 1,
    });
  } else if (contract > 0) {
    tables.push({
      title: "Totaal",
      columns: amountTableColumns(),
      rows: [["Aanneemsom (excl. BTW)", formatEUR(contract)]],
      emphasizeRow: () => true,
    });
  }

  // Staat de architect als begrotingsregel, dan belasten we hem door en mag de
  // uitsluiting hieronder er niet staan — precies dezelfde voorwaarde als in
  // clausule 6 van de offerte (lib/quote-clauses.ts).
  const architectInBegroting = lines.some((l) =>
    /architect|direcci[oó]n t[eé]cnica|technische leiding/i.test(l.description ?? ""),
  );

  // Vaste slotpassage — zelfde strekking als de voorbehouden onder de offerte
  // (lib/quote-clauses.ts): onvoorzien en meerwerk vallen buiten de begroting.
  tables.push({
    title: "Onvoorziene werkzaamheden & meerwerk",
    subtitle: [
      "Bij een verbouwing kunnen zich altijd onvoorziene kosten en meerwerk voordoen (verborgen gebreken, hardere ondergrond, gewijzigde keuzes). Werkzaamheden die niet in deze begroting zijn opgenomen vallen erbuiten en worden na overleg apart verrekend.",
      "Meerwerk wordt uitsluitend uitgevoerd na schriftelijk akkoord van de opdrachtgever en wordt apart verrekend. Een opgenomen onvoorzien-post wordt uitsluitend verrekend voor zover daadwerkelijk gebruikt.",
      "Stelposten zijn richtbedragen: kiest de opdrachtgever een duurdere uitvoering, dan wordt het verschil als meerprijs verrekend; een voordeliger keuze wordt als minderprijs in mindering gebracht.",
      ...(architectInBegroting
        ? []
        : [
            "Architect en technische leiding vallen buiten deze begroting: de opdrachtgever contracteert hen zelf en voldoet die facturen rechtstreeks.",
          ]),
      "Alle bedragen zijn exclusief btw.",
    ].join("\n"),
    columns: [],
    rows: [],
  });

  const subtitleBits = ["Begroting per fase", "alle bedragen excl. BTW"];
  const c = await getPdfContact(project.contactId);
  if (c?.name) subtitleBits.unshift(c.name);
  const contactEmail = c?.email ?? null;

  const buffer = await renderReportPdf({
    title: `Begroting — ${project.name}`,
    subtitle: subtitleBits.join(" · "),
    generatedAt: new Date(),
    kpis: [],
    tables,
  });

  const safe = project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return {
    buffer,
    filename: `Begroting-${safe || "project"}-${pdfDateStamp()}.pdf`,
    projectName: project.name,
    contactEmail,
  };
}
