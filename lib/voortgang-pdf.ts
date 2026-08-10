/* Bouwt de klant-voortgangs-PDF: per bouwfase een groene voortgangsbalk plus
 * de totale projectvoortgang — zonder interne kosten of marges. Gedeeld door
 * de download-route en (later) een eventuele mail-actie. */
import "server-only";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectBudgetLines, projectPhases, projects } from "@/lib/db/schema";
import { getPdfContact, pdfDateStamp, phaseKey, sumAmountEur, type ClientPdf } from "@/lib/pdf-shared";
import { renderReportPdf } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

/** Resultaat van {@link renderVoortgangPdf} — zie {@link ClientPdf}. */
export type VoortgangPdf = ClientPdf;

export async function renderVoortgangPdf(projectId: string): Promise<VoortgangPdf | null> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return null;

  const [faseRows, budgetRows, contact] = await Promise.all([
    db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.sortOrder)),
    db.select().from(projectBudgetLines).where(eq(projectBudgetLines.projectId, projectId)),
    getPdfContact(project.contactId),
  ]);
  // Oudere projecten hebben soms alleen budgetregels: die fases tellen mee op
  // 0% — zelfde terugval als de voortgangskaart op het projectscherm.
  const bekend = new Set(faseRows.map((f) => f.name));
  const uitBudget = [...new Set(budgetRows.map((b) => phaseKey(b.phase)).filter(Boolean))]
    .filter((naam) => !bekend.has(naam))
    .map((naam) => ({ name: naam, progressPct: 0 }));
  const fases = [...faseRows.map((f) => ({ name: f.name, progressPct: f.progressPct })), ...uitBudget];
  if (fases.length === 0) return null;

  // Totale voortgang gewogen naar de begrote waarde per fase (een fase van
  // € 40.000 telt zwaarder dan een van € 2.000); zonder begroting telt elke
  // fase even zwaar.
  const gewichtVan = (naam: string) => sumAmountEur(budgetRows.filter((b) => phaseKey(b.phase) === naam));
  const gewichten = fases.map((f) => gewichtVan(f.name));
  const totaalGewicht = gewichten.reduce((s, g) => s + g, 0);
  const totaal =
    totaalGewicht > 0
      ? fases.reduce((s, f, i) => s + f.progressPct * gewichten[i], 0) / totaalGewicht
      : fases.reduce((s, f) => s + f.progressPct, 0) / fases.length;
  const totaalPct = Math.round(totaal);
  const gereed = fases.filter((f) => f.progressPct >= 100).length;
  const bezig = fases.filter((f) => f.progressPct > 0 && f.progressPct < 100).length;

  const status = (pct: number) => (pct >= 100 ? "Gereed" : pct > 0 ? "In uitvoering" : "Nog niet gestart");

  // Met een begroting tonen we het bedrag per fase (targetprijzen, ex btw —
  // dezelfde bedragen als op de begroting-PDF) en de gereedgekomen waarde.
  const metBedragen = totaalGewicht > 0;
  const waardeGereed = fases.reduce((s, f, i) => s + (gewichten[i] * f.progressPct) / 100, 0);

  const buffer = await renderReportPdf({
    title: "Voortgang van uw project",
    subtitle: [project.name, contact?.name ? `voor ${contact.name}` : null].filter(Boolean).join(" — "),
    generatedAt: new Date(),
    kpis: [
      { label: "Totale voortgang", value: `${totaalPct}%` },
      { label: "Fases gereed", value: `${gereed} van ${fases.length}` },
      metBedragen
        ? { label: "Waarde gereed", value: formatEUR(waardeGereed), hint: `van ${formatEUR(totaalGewicht)} excl. btw` }
        : { label: "In uitvoering", value: String(bezig) },
    ],
    tables: [
      {
        title: "Voortgang per bouwfase",
        subtitle: metBedragen
          ? "In volgorde van uitvoering. Bedragen volgens de begroting, excl. btw."
          : "In volgorde van uitvoering. De balk toont hoe ver elke fase is.",
        columns: metBedragen
          ? [
              { header: "Fase", flex: 2 },
              { header: "Begroot", align: "right", flex: 0.9 },
              { header: "Status", flex: 1 },
              { header: "Voortgang", flex: 1.6, kind: "progress" },
            ]
          : [
              { header: "Fase", flex: 2 },
              { header: "Status", flex: 1 },
              { header: "Voortgang", flex: 1.6, kind: "progress" },
            ],
        rows: fases.map((f, i) =>
          metBedragen
            ? [f.name, gewichten[i] > 0 ? formatEUR(gewichten[i]) : "", status(f.progressPct), String(f.progressPct)]
            : [f.name, status(f.progressPct), String(f.progressPct)],
        ),
      },
    ],
  });

  return {
    buffer,
    filename: `voortgang-${(project.name ?? "project").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${pdfDateStamp()}.pdf`,
    projectName: project.name,
    contactEmail: contact?.email ?? null,
  };
}
