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
import { Combobox } from "@/components/combobox";
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
  /** Leverancier staat al bekend als vaste last (energie, telefonie, …). */
  overhead: boolean;
  lines: ReviewLine[];
  attachmentId: string;
  attachmentName: string;
  duplicateOfPoId: string | null;
  supplierEmail: string | null;
  /** Kandidaat-adressen voor de afkeurmail, beste eerst. */
  emailCandidates: { email: string; source: string; uncertain: boolean }[];
  /** Voorgeschreven concept: onderwerp en tekst. */
  draft: { subject: string; text: string } | null;
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
  const [sendMail, setSendMail] = useState(true);
  const [mailTo, setMailTo] = useState(data.emailCandidates[0]?.email ?? "");
  const gekozen = data.emailCandidates.find((c) => c.email === mailTo);

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
                  <Combobox
                    name="projectId"
                    defaultValue={data.projectId ?? ""}
                    clearable
                    placeholder="Zoek een werf…"
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    menuClassName="w-72"
                  />
                  {/* Vaste lasten horen bij geen enkele werf. Eén keer aanvinken
                      en het systeem vraagt bij de volgende factuur van deze
                      leverancier niet meer om een werfreferentie. */}
                  <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" name="overhead" defaultChecked={data.overhead} />
                    <span>Algemene kosten (energie, telefoon, verzekering — hoort bij geen project)</span>
                  </label>
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

      {/* Afkeuren, met de mail naar de leverancier erbij */}
      {rejecting && (
        <form action={rejectReviewAction.bind(null, data.id)} className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Afkeuren</p>

          <Field label="Interne reden" htmlFor={`why-${data.id}`} hint="komt in het logboek, niet in de mail">
            <Textarea
              id={`why-${data.id}`}
              name="reason"
              rows={2}
              required
              defaultValue={
                teMelden.length > 0
                  ? `Incompleet: ${teMelden.map((c) => c.label.toLowerCase()).join(", ")}.`
                  : ""
              }
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sendMail" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
            <span>Terugsturen naar de leverancier met de vraag om aanpassing</span>
          </label>

          {sendMail && (
            <div className="space-y-3 rounded-md bg-surface/50 p-3">
              {data.emailCandidates.length === 0 ? (
                <p className="text-xs text-warning">
                  We kennen geen e-mailadres van deze leverancier. Vul er zelf een in, of keur alleen intern af en mail
                  zelf.
                </p>
              ) : null}
              <Field label="Aan" htmlFor={`to-${data.id}`}>
                <Select
                  id={`to-${data.id}`}
                  name="mailTo"
                  value={mailTo}
                  onChange={(e) => setMailTo(e.target.value)}
                >
                  {data.emailCandidates.map((c) => (
                    <option key={c.email} value={c.email}>
                      {c.email} — {c.source}
                      {c.uncertain ? " ⚠ mogelijk de doorstuurder" : ""}
                    </option>
                  ))}
                  <option value="">— zelf invullen —</option>
                </Select>
              </Field>
              {mailTo === "" && (
                <Field label="E-mailadres" htmlFor={`toManual-${data.id}`}>
                  <Input id={`toManual-${data.id}`} name="mailTo" type="email" placeholder="leverancier@example.es" />
                </Field>
              )}
              {gekozen?.uncertain && (
                <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                  Dit adres lijkt van de partij die de factuur alleen dóórstuurde, niet van de leverancier zelf. Controleer
                  het voordat je verstuurt — anders krijgt de verkeerde partij dit bericht.
                </p>
              )}
              <Field label="Onderwerp" htmlFor={`subj-${data.id}`}>
                <Input id={`subj-${data.id}`} name="mailSubject" defaultValue={data.draft?.subject ?? ""} />
              </Field>
              <Field label="Bericht" htmlFor={`body-${data.id}`} hint="pas aan wat je wilt — dit gaat er letterlijk uit">
                <Textarea id={`body-${data.id}`} name="mailBody" rows={12} defaultValue={data.draft?.text ?? ""} />
              </Field>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" name="attachInvoice" />
                <span>De originele factuur als bijlage meesturen</span>
              </label>
              <p className="text-xs text-muted">
                Gaat als antwoord in dezelfde mailthread, vanaf purchase@habitat-one.com met jouw naam erbij. Het antwoord
                van de leverancier — met de gecorrigeerde factuur — komt daar dus meteen weer binnen en belandt terug in
                deze wachtrij.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="primary" pendingLabel="Bezig…">
              {sendMail ? "Afkeuren en versturen" : "Alleen afkeuren"}
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
