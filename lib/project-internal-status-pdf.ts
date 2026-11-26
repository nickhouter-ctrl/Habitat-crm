import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { pdfDateStamp } from "@/lib/pdf-shared";
import { loadProjectFunding } from "@/lib/project-funding";
import { deriveInternalStatus } from "@/lib/project-internal-status";
import { renderReportPdf } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

/** Interne PDF "Stand intern": echte kosten naast doorberekend. Nooit naar de klant. */
export async function renderInternalStatusPdf(projectId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { name: true } });
  if (!project) return null;
  const [funding, [gain]] = await Promise.all([
    loadProjectFunding(projectId, true),
    // Zelfde urenselectie als het voorschot: portaaluren pas na goedkeuring.
    db.execute<{ gain: string; hours: string }>(sql`select
        coalesce(sum(hours * (hourly_cost_eur - actual_hourly_cost_eur)), 0)::text gain,
        coalesce(sum(hours) filter (where actual_hourly_cost_eur is not null), 0)::text hours
      from time_entries where project_id = ${projectId} and actual_hourly_cost_eur is not null
        and not (self_logged_at is not null and approved_at is null)`),
  ]);
  const current = funding.get(projectId);
  if (!current) return null;
  const s = deriveInternalStatus({
    cover: current.cover, margins: current.margins,
    ownProductCost: current.own.bookedCost, laborRateGain: Number(gain?.gain ?? 0),
  });
  const E = formatEUR;
  const gainHours = Number(gain?.hours ?? 0);
  const buffer = await renderReportPdf({
    title: `${project.name}: stand intern`,
    subtitle: "Alleen voor intern gebruik · niet naar de klant · bedragen ex. btw",
    generatedAt: new Date(),
    typography: "readable",
    kpis: [
      { label: s.prefinancedReal >= 0 ? "Echt voorgeschoten" : "Netto in kas", value: E(Math.abs(s.prefinancedReal)), hint: "onze kosten − ontvangen" },
      { label: s.prefinancedClient >= 0 ? "Klant moet aanvullen" : "Voorschot over", value: E(Math.abs(s.prefinancedClient)), hint: "volgens voorschotoverzicht" },
      { label: "Verschil", value: E(s.prefinancedClient - s.prefinancedReal), hint: "opslag en uurtariefverschil" },
    ],
    tables: [
      {
        title: "Echte kosten tegenover doorberekend",
        subtitle: "Bron: uren, inkoopfacturen, projectkosten en eigen producten in het CRM. Uren tegen wat de arbeider echt kreeg.",
        columns: [{ header: "Post", flex: 3.2 }, { header: "Onze kosten", flex: 1.5, align: "right" }, { header: "Doorberekend", flex: 1.5, align: "right" }],
        rows: [
          [gainHours > 0 ? `Arbeid (${gainHours.toLocaleString("nl-NL")} uur tegen werkelijk betaald tarief)` : "Arbeid", E(s.labor.cost), E(s.labor.charged)],
          ["Bouwmaterialen en inkoop derden", E(s.materials.cost), E(s.materials.charged)],
          ["Overige diensten (architect, onderaannemers, huur, vervoer)", E(s.other.cost), E(s.other.charged)],
          ["Totaal werk", E(s.work.cost), E(s.work.charged)],
          ["Eigen producten door ons betaald (o.a. kozijnen, sanitair, verlichting)", E(s.products), E(s.products)],
          ["Totaal", E(s.totalCost), E(s.totalCharged)],
          ["Ontvangen van de klant", E(s.received), E(s.received)],
          ["Voorgeschoten", E(s.prefinancedReal), E(s.prefinancedClient)],
        ],
        emphasizeRow: (r) => r === 7,
      },
      {
        title: "Waar het verschil uit bestaat",
        columns: [{ header: "Omschrijving", flex: 4 }, { header: "Bedrag", flex: 1.5, align: "right" }],
        rows: [
          ["Opslag op uitgevoerd werk", E(s.markup)],
          ["Verschil doorberekend en werkelijk betaald uurtarief", E(s.laborRateGain)],
          ...(Math.abs(s.adjustments) >= 0.01 ? [["Overige verrekeningen (tegoed, productontvangsten)", E(s.adjustments)]] : []),
          ["Totaal verschil", E(s.prefinancedClient - s.prefinancedReal)],
        ],
        emphasizeRow: (r) => r === (Math.abs(s.adjustments) >= 0.01 ? 3 : 2),
      },
    ],
  });
  return { buffer, filename: `stand-intern-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${pdfDateStamp()}.pdf` };
}
