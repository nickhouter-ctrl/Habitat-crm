"use client";

/**
 * Eén factuur in de wachtrij: wat de AI ervan maakte, wat er aan mankeert, en de
 * knoppen om te beslissen.
 *
 * Corrigeren moet kunnen vóór goedkeuren — een poort die alleen ja/nee vraagt bij
 * een verkeerd uitgelezen bedrag is erger dan geen poort.
 */
import { useState } from "react";

import { Badge, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatEUR } from "@/lib/utils";
import { approveReviewAction, ignoreReviewAction, rejectReviewAction } from "./actions";

export type ReviewCheck = {
  key: string;
  label: string;
  severity: "blocking" | "warning";
  ok: boolean;
  skipped?: boolean;
  found?: string | null;
  es: string;
  internal?: boolean;
};

export type ReviewLine = {
  projectId: string | null;
  projectHint: string | null;
  description: string | null;
  hours: number | null;
  amount: number | null;
};

export type ReviewCardData = {
  id: string;
  supplier: string | null;
  reference: string | null;
  total: number | null;
  subtotal: number | null;
  currency: string | null;
  totalOriginal: number | null;
  fxRate: number | null;
  invoiceDate: string | null;
  verdict: "ok" | "warn" | "reject" | "unreadable" | "pending";
  checks: ReviewCheck[];
  projectId: string | null;
  kind: "labor" | "material" | null;
  hours: number | null;
  lines: ReviewLine[];
  attachmentId: string;
  attachmentName: string;
  duplicateOfPoId: string | null;
  supplierEmail: string | null;
  wachtDagen: number;
};

const VERDICT: Record<ReviewCardData["verdict"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ok: { label: "Compleet", tone: "success" },
  warn: { label: "Let op", tone: "warning" },
  reject: { label: "Incompleet", tone: "danger" },
  unreadable: { label: "Niet gelezen", tone: "neutral" },
  pending: { label: "Nog niet beoordeeld", tone: "neutral" },
};

export function ReviewCard({
  data,
  projects,
}: {
  data: ReviewCardData;
  projects: { id: string; name: string }[];
}) {
  const [kind, setKind] = useState<"labor" | "material" | "">(data.kind ?? "");
  const [split, setSplit] = useState(data.lines.length > 1);
  const [rejecting, setRejecting] = useState(false);

  const verdict = VERDICT[data.verdict];
  // De intake zet de terugrekening als bevinding neer; die tonen we bij het
  // urenveld in plaats van tussen de gebreken.
  const urenAfgeleid = data.checks.find((c) => c.key === "hours_derived")?.label ?? null;
  const gefaald = data.checks.filter((c) => !c.ok && !c.skipped && c.key !== "hours_derived");
  const gelezen = data.checks.filter((c) => c.ok && !c.skipped);
  const teMelden = gefaald.filter((c) => !c.internal && c.es);

  return (
    <div className="rounded-lg border bg-background p-4">
      {/* Kop: wie, wat, hoeveel */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {data.supplier ?? <span className="text-warning">(leverancier onbekend)</span>}
            <Badge tone={verdict.tone}>{verdict.label}</Badge>
            {data.wachtDagen >= 7 && <Badge tone="danger">wacht {data.wachtDagen} dagen</Badge>}
          </p>
          <p className="text-xs text-muted">
            {data.reference ?? "geen referentie"}
            {data.invoiceDate ? ` · ${data.invoiceDate}` : ""} · {data.attachmentName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{data.total != null ? formatEUR(data.total) : "—"}</p>
          {data.subtotal != null && <p className="text-xs text-muted">ex. btw {formatEUR(data.subtotal)}</p>}
          {data.currency && data.currency !== "EUR" && data.totalOriginal != null && (
            <p className="text-xs text-muted">
              {data.currency} {data.totalOriginal.toFixed(2)} · koers {data.fxRate?.toFixed(4)}
            </p>
          )}
        </div>
      </div>

      {/* Het oordeel */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-surface/50 p-2.5 text-xs">
          <p className="mb-1 font-medium text-muted">Gelezen van de factuur</p>
          {gelezen.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <ul className="space-y-0.5">
              {gelezen.slice(0, 8).map((c) => (
                <li key={c.key} className="flex gap-1.5">
                  <span className="text-success">✓</span>
                  <span className="text-muted">{c.label}</span>
                  {c.found && <span className="truncate">{String(c.found).slice(0, 34)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`rounded-md p-2.5 text-xs ${gefaald.length ? "bg-warning/10" : "bg-surface/50"}`}>
          <p className="mb-1 font-medium text-muted">Wat ontbreekt of opvalt</p>
          {gefaald.length === 0 ? (
            <p className="text-success">Niets — alles staat erop.</p>
          ) : (
            <ul className="space-y-0.5">
              {gefaald.map((c) => (
                <li key={c.key} className="flex gap-1.5">
                  <span className={c.severity === "blocking" ? "text-danger" : "text-warning"}>
                    {c.severity === "blocking" ? "✗" : "!"}
                  </span>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          )}
          {data.duplicateOfPoId && (
            <p className="mt-1.5">
              <a href={`/inkooporders/${data.duplicateOfPoId}`} className="text-accent hover:underline">
                → bekijk de bestaande inkooporder
              </a>
            </p>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs">
        <a href={`/api/archief/${data.attachmentId}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Factuur openen (PDF)
        </a>
      </p>

      {/* Goedkeuren, met correctie */}
      {!rejecting && (
        <form action={approveReviewAction.bind(null, data.id)} className="space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Leverancier" htmlFor={`sup-${data.id}`}>
              <Input id={`sup-${data.id}`} name="supplier" defaultValue={data.supplier ?? ""} />
            </Field>
            <Field label="Referentie" htmlFor={`ref-${data.id}`}>
              <Input id={`ref-${data.id}`} name="reference" defaultValue={data.reference ?? ""} />
            </Field>
            <Field label="Totaal (incl. btw)" htmlFor={`tot-${data.id}`}>
              <Input
                id={`tot-${data.id}`}
                name="total"
                inputMode="decimal"
                className="text-right"
                defaultValue={data.total != null ? String(data.total).replace(".", ",") : ""}
              />
            </Field>
            <Field label="Ex. btw" htmlFor={`sub-${data.id}`} hint="leeg = gelijk aan totaal">
              <Input
                id={`sub-${data.id}`}
                name="subtotal"
                inputMode="decimal"
                className="text-right"
                defaultValue={data.subtotal != null ? String(data.subtotal).replace(".", ",") : ""}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Soort" htmlFor={`kind-${data.id}`}>
              <Select
                id={`kind-${data.id}`}
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="">— kies —</option>
                <option value="labor">Uren / arbeid</option>
                <option value="material">Materiaal / inkoop</option>
              </Select>
            </Field>

            {!split && (
              <>
                <Field
                  label="Project"
                  htmlFor={`proj-${data.id}`}
                  hint={data.projectId ? "herkend op de factuur" : "staat niet op de factuur — kies zelf"}
                >
                  <Select id={`proj-${data.id}`} name="projectId" defaultValue={data.projectId ?? ""}>
                    <option value="">— geen project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {kind === "labor" && (
                  <Field
                    label="Uren"
                    htmlFor={`hrs-${data.id}`}
                    hint={urenAfgeleid ?? "bepaalt het uurtarief"}
                  >
                    <Input
                      id={`hrs-${data.id}`}
                      name="hours"
                      inputMode="decimal"
                      className="text-right"
                      defaultValue={data.hours != null ? String(data.hours) : ""}
                    />
                  </Field>
                )}
              </>
            )}
          </div>

          {/* Verdeling over meerdere werven */}
          <div className="rounded-md bg-surface/50 p-2.5">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              <span>
                Deze factuur loopt over <strong>meerdere werven</strong>
                {data.lines.length > 1 ? ` — de AI zag ${data.lines.length} werven` : ""}
              </span>
            </label>
            {split && (
              <div className="mt-2 space-y-2">
                {(data.lines.length > 1 ? data.lines : [emptyLine(), emptyLine()]).map((l, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem]">
                    <Select name={`split_${i}_projectId`} defaultValue={l.projectId ?? ""}>
                      <option value="">— kies project —</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      name={`split_${i}_hours`}
                      inputMode="decimal"
                      placeholder="uren"
                      className="text-right"
                      defaultValue={l.hours != null ? String(l.hours) : ""}
                    />
                    <Input
                      name={`split_${i}_amount`}
                      inputMode="decimal"
                      placeholder="bedrag ex. btw"
                      className="text-right"
                      defaultValue={l.amount != null ? String(l.amount).replace(".", ",") : ""}
                    />
                    {l.projectHint && <p className="text-xs text-muted sm:col-span-3">op de factuur: {l.projectHint}</p>}
                  </div>
                ))}
                <p className="text-xs text-muted">
                  De bedragen samen horen op {data.subtotal != null ? formatEUR(data.subtotal) : "het bedrag ex. btw"} uit te
                  komen. De inkooporder zelf blijft bij een verdeling ongekoppeld — anders telt het bedrag dubbel.
                </p>
              </div>
            )}
          </div>

          {kind === "labor" && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="hoursAlreadyLogged" />
              <span>Deze uren staan al via het portaal op het project — geen nieuwe urenregel maken</span>
            </label>
          )}

          {!split && !data.projectId && (
            <p className="text-xs text-warning">
              Er staat geen werf of project op deze factuur. Kies er hierboven zelf een, anders komen deze kosten op geen
              enkel project terecht.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton variant="primary" pendingLabel="Goedkeuren…">
              Goedkeuren
            </SubmitButton>
            <button type="button" onClick={() => setRejecting(true)} className={buttonClass({ variant: "secondary" })}>
              Afkeuren
            </button>
            <span className="flex-1" />
            <IgnoreButton reviewId={data.id} />
          </div>
        </form>
      )}

      {/* Afkeuren */}
      {rejecting && (
        <form action={rejectReviewAction.bind(null, data.id)} className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Afkeuren — wat mankeert er?</p>
          {teMelden.length > 0 && (
            <p className="text-xs text-muted">
              De controle vond dit: {teMelden.map((c) => c.label.toLowerCase()).join(", ")}. Zet het hieronder in je eigen
              woorden; het versturen naar de leverancier bouw ik in de volgende stap.
            </p>
          )}
          <Textarea
            name="reason"
            rows={4}
            required
            defaultValue={
              teMelden.length > 0
                ? `Factuur ${data.reference ?? ""} kan niet verwerkt worden. Ontbreekt: ${teMelden
                    .map((c) => c.label.toLowerCase())
                    .join(", ")}.`
                : ""
            }
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="primary" pendingLabel="Afkeuren…">
              Afkeuren
            </SubmitButton>
            <button type="button" onClick={() => setRejecting(false)} className={buttonClass({ variant: "ghost" })}>
              Terug
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function IgnoreButton({ reviewId }: { reviewId: string }) {
  return (
    <SubmitButton
      variant="ghost"
      size="sm"
      className="text-muted"
      pendingLabel="…"
      formAction={ignoreReviewAction.bind(null, reviewId)}
      title="Geen te-betalen post (bv. een reclamemail die als factuur is aangemerkt)"
    >
      Negeren
    </SubmitButton>
  );
}

const emptyLine = (): ReviewLine => ({ projectId: null, projectHint: null, description: null, hours: null, amount: null });
