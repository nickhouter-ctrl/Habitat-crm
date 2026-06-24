/* Bouwt de klant-begroting-PDF (per fase, targetprijzen, zonder interne kost/marge).
 * Gedeeld door de print-route en de "versturen naar klant"-actie. */
import "server-only";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { contacts, projectBudgetLines, projectPhases, projects } from "@/lib/db/schema";
import { renderReportPdf, type ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

const CAT_LABEL: Record<string, string> = {
  labor: "Arbeid",
  material: "Materiaal",
  subcontractor: "Onderaanneming",
  equipment: "Materieel",
  other: "Overig",
};

export type BudgetPdf = { buffer: Buffer; filename: string; projectName: string; contactEmail: string | null };

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
  const linesOf = (key: string) => lines.filter((l) => (l.phase ?? "").trim() === key);

  const lineLabel = (l: (typeof lines)[number]) => {
    const sub: string[] = [];
    if (l.section) sub.push(l.section);
    if (l.quantity && l.unitPriceEur)
      sub.push(`${Number(l.quantity).toLocaleString("nl-NL")} × ${formatEUR(l.unitPriceEur)}`);
    else sub.push(CAT_LABEL[l.category] ?? l.category);
    if (l.isStelpost) sub.push("stelpost");
    return `${l.description}  ·  ${sub.join(" · ")}`;
  };

  const tables: ReportTable[] = [];
  const sectionFor = (title: string, subtitle: string | undefined, grp: typeof lines) => {
    const subtotal = grp.reduce((s, l) => s + Number(l.amountEur ?? 0), 0);
    const hasPrices = subtotal > 0;
    // Prijs alleen tonen als die er is; anders is de regel pure uitleg (bestek).
    const rows = grp.map((l) => [lineLabel(l), Number(l.amountEur ?? 0) > 0 ? formatEUR(l.amountEur) : ""]);
    if (hasPrices) rows.push(["Subtotaal", formatEUR(subtotal)]);
    tables.push({
      title,
      subtitle,
      columns: [
        { header: "Onderdeel", flex: 4 },
        { header: hasPrices ? "Bedrag" : "", align: "right", flex: 1.3 },
      ],
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
  const ungrouped = lines.filter((l) => !phaseNames.includes((l.phase ?? "").trim()));
  if (ungrouped.length > 0) sectionFor("Werkzaamheden", undefined, ungrouped);

  const base = lines.reduce((s, l) => s + Number(l.amountEur ?? 0), 0);
  const pct = project.contingencyPct != null ? Number(project.contingencyPct) : 0;
  const contingency = pct > 0 ? Math.round(base * (pct / 100) * 100) / 100 : 0;
  const contract = project.contractPriceEur != null ? Number(project.contractPriceEur) : 0;
  // Met regelprijzen: subtotaal (+onvoorzien). Geen regelprijzen maar wél een
  // afgesproken aanneemprijs: toon die als totaal. Anders: geen totaalblok (puur bestek).
  if (base > 0) {
    const totalRows: string[][] = [["Subtotaal werkzaamheden", formatEUR(base)]];
    if (contingency > 0) totalRows.push([`Onvoorzien (${pct}%)`, formatEUR(contingency)]);
    totalRows.push(["Totaal (excl. BTW)", formatEUR(base + contingency)]);
    tables.push({
      title: "Totaal",
      columns: [{ header: "", flex: 4 }, { header: "Bedrag", align: "right", flex: 1.3 }],
      rows: totalRows,
      emphasizeRow: (i) => i === totalRows.length - 1,
    });
  } else if (contract > 0) {
    tables.push({
      title: "Totaal",
      columns: [{ header: "", flex: 4 }, { header: "Bedrag", align: "right", flex: 1.3 }],
      rows: [["Aanneemsom (excl. BTW)", formatEUR(contract)]],
      emphasizeRow: () => true,
    });
  }

  const subtitleBits = ["Begroting per fase", "alle bedragen excl. BTW"];
  let contactEmail: string | null = null;
  if (project.contactId) {
    const c = await db.query.contacts.findFirst({
      where: eq(contacts.id, project.contactId),
      columns: { name: true, email: true },
    });
    if (c?.name) subtitleBits.unshift(c.name);
    contactEmail = c?.email ?? null;
  }

  const buffer = await renderReportPdf({
    title: `Begroting — ${project.name}`,
    subtitle: subtitleBits.join(" · "),
    generatedAt: new Date(),
    kpis: [],
    tables,
  });

  const safe = project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const today = new Date().toISOString().slice(0, 10);
  return { buffer, filename: `Begroting-${safe || "project"}-${today}.pdf`, projectName: project.name, contactEmail };
}
