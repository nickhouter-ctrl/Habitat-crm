import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LinkButton,
  PageHeader,
  TBody,
  Table,
  Td,
  Textarea,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { projectBudgetLines, projectPhases, projects } from "@/lib/db/schema";
import { formatEUR } from "@/lib/utils";
import {
  addBudgetLine,
  addProjectPhase,
  createEstimateFromBudget,
  deleteBudgetLine,
  deleteProjectPhase,
  sendBudgetToClient,
} from "../../actions";

export const metadata = { title: "Begroting" };

export default async function BegrotingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();

  const [phaseRows, budgetRows] = await Promise.all([
    db.select().from(projectPhases).where(eq(projectPhases.projectId, id)).orderBy(asc(projectPhases.sortOrder)),
    db
      .select()
      .from(projectBudgetLines)
      .where(eq(projectBudgetLines.projectId, id))
      .orderBy(asc(projectBudgetLines.sortOrder), asc(projectBudgetLines.createdAt)),
  ]);

  const budgetTargetBase = budgetRows.reduce((s, b) => s + Number(b.amountEur ?? 0), 0);
  const budgetCostTotal = budgetRows.reduce((s, b) => s + Number(b.estimatedCostEur ?? 0), 0);
  const contingencyPct = project.contingencyPct != null ? Number(project.contingencyPct) : 0;
  const contingencyAmt = contingencyPct > 0 ? Math.round(budgetTargetBase * (contingencyPct / 100) * 100) / 100 : 0;
  const budgetTargetTotal = budgetTargetBase + contingencyAmt;
  const begrootMarge = budgetTargetBase - budgetCostTotal;
  const begrootMargePct = budgetTargetBase > 0 ? Math.round((begrootMarge / budgetTargetBase) * 100) : null;

  const phaseNames = phaseRows.map((p) => p.name);
  const linesOfPhase = (name: string) => budgetRows.filter((b) => (b.phase ?? "").trim() === name);
  const ungrouped = budgetRows.filter((b) => !phaseNames.includes((b.phase ?? "").trim()));
  type Block = { key: string; title: string; description: string | null; plannedWeeks: string | null; phaseValue: string; lines: typeof budgetRows };
  const blocks: Block[] = phaseRows.map((p) => ({
    key: p.id,
    title: p.name,
    description: p.description,
    plannedWeeks: p.plannedWeeks,
    phaseValue: p.name,
    lines: linesOfPhase(p.name),
  }));
  if (ungrouped.length > 0 || phaseRows.length === 0) {
    blocks.push({
      key: "_geen",
      title: "Zonder fase",
      description: phaseRows.length === 0 ? "voeg onderdelen toe, of maak eerst fases aan" : null,
      plannedWeeks: null,
      phaseValue: "",
      lines: ungrouped,
    });
  }

  const mail = typeof sp.mail === "string" ? sp.mail : "";

  return (
    <>
      <PageHeader
        title={`Begroting — ${project.name}`}
        subtitle="Per fase opgebouwd · targetprijs is wat de klant betaalt · interne kost/marge alleen voor jullie"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/projects/${id}`} variant="ghost">
              ← Project
            </LinkButton>
            {(phaseRows.length > 0 || budgetRows.length > 0) && (
              <>
                <LinkButton href={`/projects/${id}/begroting/pdf`} target="_blank" variant="secondary">
                  📄 Printen
                </LinkButton>
                <form action={sendBudgetToClient.bind(null, id)}>
                  <SubmitButton variant="secondary" pendingLabel="Versturen…">
                    ✉ Versturen naar klant
                  </SubmitButton>
                </form>
                {budgetRows.length > 0 && (
                  <form action={createEstimateFromBudget.bind(null, id)}>
                    <SubmitButton variant="primary" pendingLabel="Bezig…">
                      → Offerte maken
                    </SubmitButton>
                  </form>
                )}
              </>
            )}
          </div>
        }
      />

      {mail === "ok" && (
        <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">✓ Begroting verstuurd naar de klant.</p>
      )}
      {mail === "geenadres" && (
        <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">Geen e-mailadres bij de klant — vul dat eerst in bij het contact.</p>
      )}
      {mail === "mislukt" && (
        <p className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">Versturen mislukt — e-mail is mogelijk nog niet ingesteld.</p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-surface p-3">
          <p className="text-xs text-muted">Totaal (= doel)</p>
          <p className="text-lg font-semibold tabular-nums">{formatEUR(budgetTargetTotal)}</p>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <p className="text-xs text-muted">Geraamde kost</p>
          <p className="text-lg font-semibold tabular-nums">{budgetCostTotal > 0 ? formatEUR(budgetCostTotal) : "—"}</p>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <p className="text-xs text-muted">Begrote marge</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatEUR(begrootMarge)}
            {begrootMargePct != null ? ` · ${begrootMargePct}%` : ""}
          </p>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <p className="text-xs text-muted">Fases</p>
          <p className="text-lg font-semibold tabular-nums">{phaseRows.length}</p>
        </div>
      </div>

      {/* Fases */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Fases</CardTitle>
          <span className="text-xs text-muted">wat er per fase gebeurt — sturen de begroting & facturatie aan</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {phaseRows.length > 0 && (
            <div className="space-y-2">
              {phaseRows.map((ph) => (
                <div key={ph.id} className="flex items-start justify-between gap-2 rounded-md border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{ph.name}</p>
                    {ph.description ? <p className="whitespace-pre-line text-xs text-muted">{ph.description}</p> : null}
                    {ph.plannedWeeks ? <p className="text-[11px] text-muted">🗓 {ph.plannedWeeks}</p> : null}
                  </div>
                  <form action={deleteProjectPhase.bind(null, id, ph.id)}>
                    <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
          <form action={addProjectPhase.bind(null, id)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Fase">
                <Input name="name" required placeholder="bijv. Fase 1 — Sloop" />
              </Field>
              <Field label="Planning (optioneel)">
                <Input name="plannedWeeks" placeholder="bijv. Week 1–3 · 2 weken" />
              </Field>
              <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Fase</SubmitButton>
            </div>
            <Field label="Wat gebeurt er in deze fase (uitleg)">
              <Textarea
                name="description"
                rows={3}
                placeholder="bijv. Verwijderen bestaande binnenwanden, demonteren sanitair, afvoeren puin conform lokale regelgeving…"
              />
            </Field>
          </form>
        </CardContent>
      </Card>

      {/* Begroting */}
      <Card>
        <CardHeader>
          <CardTitle>Onderdelen per fase</CardTitle>
          <span className="text-xs text-muted">vul per fase de onderdelen + targetprijs in</span>
        </CardHeader>
        <CardContent className="space-y-5">
          {phaseRows.length === 0 && (
            <p className="rounded-md bg-background px-3 py-2 text-sm text-muted">
              Maak eerst hierboven een <strong>fase</strong> aan. Daarna voeg je per fase meerdere onderdelen met een prijs toe.
            </p>
          )}

          {blocks.map((blk) => {
            const lines = blk.lines;
            const tTotal = lines.reduce((s, b) => s + Number(b.amountEur ?? 0), 0);
            const cTotal = lines.reduce((s, b) => s + Number(b.estimatedCostEur ?? 0), 0);
            return (
              <div key={blk.key} className="overflow-hidden rounded-lg border">
                <div className="flex items-baseline justify-between gap-2 bg-background px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{blk.title}</p>
                    {blk.description ? <p className="whitespace-pre-line text-xs text-muted">{blk.description}</p> : null}
                    {blk.plannedWeeks ? <p className="text-[11px] text-muted">🗓 {blk.plannedWeeks}</p> : null}
                  </div>
                  {lines.length > 0 && <p className="shrink-0 text-sm font-semibold tabular-nums">{formatEUR(tTotal)}</p>}
                </div>

                {lines.length > 0 && (
                  <Table>
                    <THead>
                      <tr>
                        <Th>Onderdeel</Th>
                        <Th className="text-right">Targetprijs</Th>
                        <Th className="text-right">Kost</Th>
                        <Th className="text-right">Marge</Th>
                        <Th />
                      </tr>
                    </THead>
                    <TBody>
                      {lines.map((b) => {
                        const t = Number(b.amountEur ?? 0);
                        const c = b.estimatedCostEur != null ? Number(b.estimatedCostEur) : null;
                        const mp = c != null && t > 0 ? Math.round(((t - c) / t) * 100) : null;
                        return (
                          <Tr key={b.id}>
                            <Td>
                              <span className="font-medium">{b.description}</span>
                              {b.isStelpost && <Badge tone="warning" className="ml-2">stelpost</Badge>}
                              {(b.section || (b.quantity && b.unitPriceEur)) && (
                                <span className="block text-xs text-muted">
                                  {b.section ? b.section : ""}
                                  {b.section && b.quantity && b.unitPriceEur ? " · " : ""}
                                  {b.quantity && b.unitPriceEur
                                    ? `${Number(b.quantity).toLocaleString("nl-NL")} × ${formatEUR(b.unitPriceEur)}`
                                    : ""}
                                </span>
                              )}
                            </Td>
                            <Td className="text-right tabular-nums font-medium">{t > 0 ? formatEUR(t) : "—"}</Td>
                            <Td className="text-right tabular-nums text-muted">{c != null ? formatEUR(c) : "—"}</Td>
                            <Td className="text-right tabular-nums">{c != null && t > 0 ? `${formatEUR(t - c)}${mp != null ? ` · ${mp}%` : ""}` : "—"}</Td>
                            <Td className="text-right">
                              <form action={deleteBudgetLine.bind(null, id, b.id)}>
                                <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                              </form>
                            </Td>
                          </Tr>
                        );
                      })}
                      {cTotal > 0 && (
                        <Tr>
                          <Td className="text-xs text-muted">Subtotaal kost / marge</Td>
                          <Td />
                          <Td className="text-right text-xs tabular-nums text-muted">{formatEUR(cTotal)}</Td>
                          <Td className="text-right text-xs tabular-nums text-muted">{formatEUR(tTotal - cTotal)}</Td>
                          <Td />
                        </Tr>
                      )}
                    </TBody>
                  </Table>
                )}

                <form action={addBudgetLine.bind(null, id)} className="flex flex-wrap items-end gap-2 border-t bg-surface px-3 py-2.5">
                  <input type="hidden" name="phase" value={blk.phaseValue} />
                  <Field label="Onderdeel / uitleg" className="min-w-[14rem] flex-[2]">
                    <Input name="description" required placeholder="bijv. Sloop binnenwanden + afvoeren puin" />
                  </Field>
                  <Field label="Prijs € (optioneel)" className="w-32">
                    <Input name="amountEur" inputMode="decimal" placeholder="leeg = alleen uitleg" />
                  </Field>
                  <Field label="Kost € (optie)" className="w-28">
                    <Input name="estimatedCostEur" inputMode="decimal" placeholder="0,00" />
                  </Field>
                  <label className="flex items-center gap-1.5 pb-2 text-sm">
                    <input type="checkbox" name="isStelpost" className="size-4" /> stelpost
                  </label>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ onderdeel</SubmitButton>
                </form>
              </div>
            );
          })}

          {budgetRows.length > 0 && (
            <div className="ml-auto w-full max-w-sm space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotaal targetprijs</span>
                <span className="tabular-nums">{formatEUR(budgetTargetBase)}</span>
              </div>
              {contingencyAmt > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Onvoorzien ({contingencyPct}%)</span>
                  <span className="tabular-nums">{formatEUR(contingencyAmt)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Totaal (= doel)</span>
                <span className="tabular-nums">{formatEUR(budgetTargetTotal)}</span>
              </div>
              {budgetCostTotal > 0 && (
                <div className="flex justify-between font-medium text-success">
                  <span>Begrote marge</span>
                  <span className="tabular-nums">
                    {formatEUR(begrootMarge)}
                    {begrootMargePct != null ? ` · ${begrootMargePct}%` : ""}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
