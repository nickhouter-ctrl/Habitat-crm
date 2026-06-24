import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { projectBudgetLines, projectPhases, projects } from "@/lib/db/schema";
import { renderReportPdf, type ReportTable } from "@/lib/report-pdf";
import { formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = {
  labor: "Arbeid",
  material: "Materiaal",
  subcontractor: "Onderaanneming",
  equipment: "Materieel",
  other: "Overig",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return new Response("Not found", { status: 404 });

  const [lines, phaseRows] = await Promise.all([
    db
      .select()
      .from(projectBudgetLines)
      .where(eq(projectBudgetLines.projectId, id))
      .orderBy(asc(projectBudgetLines.sortOrder), asc(projectBudgetLines.createdAt)),
    db.select().from(projectPhases).where(eq(projectPhases.projectId, id)).orderBy(asc(projectPhases.sortOrder)),
  ]);

  // Groepeer op fase (in fase-volgorde), met een groep voor regels zonder fase.
  const phaseNames = phaseRows.map((p) => p.name);
  const groupKeys = Array.from(new Set([...phaseNames, ...lines.map((l) => (l.phase ?? "").trim())]));
  const linesOf = (key: string) => lines.filter((l) => (l.phase ?? "").trim() === key);

  const lineLabel = (l: (typeof lines)[number]) => {
    const bits = [l.description];
    const sub: string[] = [];
    if (l.section) sub.push(l.section);
    if (l.quantity && l.unitPriceEur)
      sub.push(`${Number(l.quantity).toLocaleString("nl-NL")} × ${formatEUR(l.unitPriceEur)}`);
    else sub.push(CAT_LABEL[l.category] ?? l.category);
    if (l.isStelpost) sub.push("stelpost");
    return `${bits.join(" ")}  ·  ${sub.join(" · ")}`;
  };

  const tables: ReportTable[] = [];
  for (const key of groupKeys) {
    const grp = linesOf(key);
    if (grp.length === 0) continue;
    const ph = phaseRows.find((p) => p.name === key);
    const subtitleParts: string[] = [];
    if (ph?.description) subtitleParts.push(ph.description);
    if (ph?.plannedWeeks) subtitleParts.push(ph.plannedWeeks);
    const subtotal = grp.reduce((s, l) => s + Number(l.amountEur ?? 0), 0);
    const rows = grp.map((l) => [lineLabel(l), formatEUR(l.amountEur)]);
    rows.push(["Subtotaal", formatEUR(subtotal)]);
    tables.push({
      title: key || "Werkzaamheden",
      subtitle: subtitleParts.join(" · ") || undefined,
      columns: [
        { header: "Onderdeel", flex: 4 },
        { header: "Bedrag", align: "right", flex: 1.3 },
      ],
      rows,
      emphasizeRow: (i) => i === rows.length - 1,
    });
  }

  // Totaal-tabel (subtotaal + onvoorzien + totaal).
  const base = lines.reduce((s, l) => s + Number(l.amountEur ?? 0), 0);
  const pct = project.contingencyPct != null ? Number(project.contingencyPct) : 0;
  const contingency = pct > 0 ? Math.round(base * (pct / 100) * 100) / 100 : 0;
  const total = base + contingency;
  const totalRows: string[][] = [["Subtotaal werkzaamheden", formatEUR(base)]];
  if (contingency > 0) totalRows.push([`Onvoorzien (${pct}%)`, formatEUR(contingency)]);
  totalRows.push(["Totaal (excl. BTW)", formatEUR(total)]);
  tables.push({
    title: "Totaal",
    columns: [
      { header: "", flex: 4 },
      { header: "Bedrag", align: "right", flex: 1.3 },
    ],
    rows: totalRows,
    emphasizeRow: (i) => i === totalRows.length - 1,
  });

  const subtitleBits = ["Begroting per fase", "alle bedragen excl. BTW"];
  if (project.contactId) {
    const c = await db.query.contacts.findFirst({
      where: (contacts, { eq: e }) => e(contacts.id, project.contactId!),
      columns: { name: true },
    });
    if (c?.name) subtitleBits.unshift(c.name);
  }

  const buf = await renderReportPdf({
    title: `Begroting — ${project.name}`,
    subtitle: subtitleBits.join(" · "),
    generatedAt: new Date(),
    kpis: [],
    tables,
  });

  const today = new Date().toISOString().slice(0, 10);
  const safe = project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Begroting-${safe || "project"}-${today}.pdf"`,
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
