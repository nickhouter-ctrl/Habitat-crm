"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, Input, Select } from "@/components/ui";
import { useT } from "@/components/taal-provider";
import { bookingProblems, bookingTotals, lineAmount, type HoldedPushLine } from "@/lib/holded/purchase-booking";
import type { ContactOption } from "@/lib/holded/purchase-push";
import { linkExistingAction, pushToHoldedAction, recoverPushAction, type HoldedPushState } from "./actions";

type Tax = { key: string; name: string; amount: string | null; group: string };
const eur = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kindLabel = { labor: "Uren", material: "Materiaal", transport: "Transport" } as const;

export function HoldedPushForm(props: {
  poId: string;
  docNumber: string;
  exVat: number;
  invoiceTotal: number;
  contact: { matched: ContactOption | null; how: "nif" | "naam" | null; candidates: ContactOption[]; canCreate: boolean };
  lines: (HoldedPushLine & { basis: string })[];
  accounts: { id: string; label: string }[];
  taxes: Tax[];
  holdedProjects: { id: string; name: string }[];
  lastError: string | null;
  exemptionNote: string | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<HoldedPushState, FormData>(pushToHoldedAction.bind(null, props.poId), {});
  const [lines, setLines] = useState(props.lines);
  const [docNumber, setDocNumber] = useState(props.docNumber);
  const [contactId, setContactId] = useState(props.contact.matched?.id ?? (props.contact.canCreate ? "new" : ""));
  const taxMap = useMemo(() => new Map(props.taxes.map((x) => [x.key, x])), [props.taxes]);
  const iva = props.taxes.filter((x) => x.group === "iva");
  const ret = props.taxes.filter((x) => x.group === "retention");
  const totals = bookingTotals(lines, taxMap);
  const problems = bookingProblems({ lines, totals, exVat: props.exVat, invoiceTotal: props.invoiceTotal, contactId: contactId || null, docNumber });
  const set = (key: string, patch: Partial<HoldedPushLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  if (state.result?.ok) {
    return (
      <Card>
        <CardContent className="space-y-2 py-5 text-sm">
          <p className="font-medium text-green-700">{state.result.message}</p>
          {state.result.warnings?.map((w) => <p key={w} className="text-amber-700">{w}</p>)}
          <p className="text-muted">{t("Keur de factuur in Holded goed om hem definitief te maken.")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <Card>
        <CardContent className="grid gap-4 py-5 text-sm sm:grid-cols-2">
          <label className="space-y-1">
            <span className="font-medium">{t("Factuurnummer leverancier")}</span>
            <Input name="docNumber" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} required />
          </label>
          <label className="space-y-1">
            <span className="font-medium">{t("Contact in Holded")}</span>
            <Select name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{t("— kies —")}</option>
              {props.contact.matched && (
                <option value={props.contact.matched.id}>
                  {props.contact.matched.name} {props.contact.matched.taxId ? `(${props.contact.matched.taxId})` : ""} — {props.contact.how === "nif" ? t("gevonden op NIF/CIF") : t("gevonden op naam")}
                </option>
              )}
              {props.contact.candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.taxId ? `(${c.taxId})` : ""}</option>
              ))}
              {props.contact.canCreate && <option value="new">{t("Nieuw contact aanmaken in Holded (op NIF/CIF van de factuur)")}</option>}
            </Select>
          </label>
          {props.exemptionNote && (
            <p className="text-amber-800 sm:col-span-2">{t("Op de factuur staat:")} “{props.exemptionNote}”. {t("Kies de btw die daarbij hoort.")}</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {lines.map((l) => (
          <Card key={l.key}>
            <CardContent className="grid gap-3 py-4 text-sm lg:grid-cols-12">
              <input type="hidden" name="lineKey" value={l.key} />
              <div className="lg:col-span-3">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted">{t(kindLabel[l.kind])} · {l.units.toLocaleString("nl-NL")} × {eur(l.price)} = <strong>{eur(lineAmount(l))}</strong></div>
                <Input className="mt-2" name={`desc_${l.key}`} value={l.desc} onChange={(e) => set(l.key, { desc: e.target.value })} aria-label={t("Omschrijving")} />
              </div>
              <label className="space-y-1 lg:col-span-3">
                <span className="text-xs text-muted">{t("Grootboekrekening")}</span>
                <Select name={`account_${l.key}`} value={l.account ?? ""} onChange={(e) => set(l.key, { account: e.target.value || null })}>
                  <option value="">{t("— kies —")}</option>
                  {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </Select>
                <span className="block text-xs text-muted">{l.basis}</span>
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-xs text-muted">{t("Btw")}</span>
                <Select name={`vat_${l.key}`} value={l.vat} onChange={(e) => set(l.key, { vat: e.target.value })}>
                  {iva.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </Select>
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-xs text-muted">{t("IRPF")}</span>
                <Select name={`ret_${l.key}`} value={l.retention ?? ""} onChange={(e) => set(l.key, { retention: e.target.value || null })}>
                  <option value="">{t("Geen")}</option>
                  {ret.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </Select>
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-xs text-muted">{t("Project in Holded")}</span>
                <Select name={`project_${l.key}`} value={l.holdedProjectId ?? ""} onChange={(e) => set(l.key, { holdedProjectId: e.target.value || null })}>
                  <option value="">{l.crmProjectId ? t("— kies —") : t("Geen project")}</option>
                  {props.holdedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </label>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 py-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
            <dt className="text-muted">{t("Subtotaal")}</dt><dd className="text-right">{eur(totals.subtotal)}</dd>
            <dt className="text-muted">{t("Btw")}</dt><dd className="text-right">{eur(totals.vat)}</dd>
            {totals.retention > 0 && (<><dt className="text-muted">{t("IRPF")}</dt><dd className="text-right">− {eur(totals.retention)}</dd></>)}
            <dt className="font-medium">{t("Totaal")}</dt><dd className="text-right font-medium">{eur(totals.total)}</dd>
            <dt className="text-muted">{t("Factuur")}</dt><dd className="text-right text-muted">{eur(props.invoiceTotal)}</dd>
          </dl>
          <div className="max-w-md space-y-2 text-right">
            {problems.map((p) => <p key={p} className="text-amber-800">{p}</p>)}
            {state.result && !state.result.ok && <p className="text-red-700">{state.result.message}</p>}
            {!state.result && props.lastError && <p className="text-red-700">{t("Vorige poging:")} {props.lastError}</p>}
            <Button type="submit" disabled={pending || problems.length > 0}>
              {pending ? t("Bezig…") : t("Als concept in Holded zetten")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

export function LinkExisting({ poId, holdedId, docNumber, total }: { poId: string; holdedId: string; docNumber: string; total: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p>{t("In Holded staat al een factuur {nr} van {bedrag} bij deze leverancier. Waarschijnlijk is hij met de hand geboekt.", { nr: docNumber, bedrag: eur(total) })}</p>
      <Button type="button" disabled={pending} onClick={() => start(async () => { const r = await linkExistingAction(poId, holdedId); setMsg(r.message); router.refresh(); })}>
        {t("Koppel aan die factuur")}
      </Button>
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}

export function RecoverUncertain({ poId }: { poId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (confirm: boolean) => start(async () => { const r = await recoverPushAction(poId, confirm); setMsg(r.message); router.refresh(); });
  return (
    <Card>
      <CardContent className="space-y-3 py-5 text-sm">
        <p className="text-amber-800">{t("De vorige verzending naar Holded kreeg geen duidelijk antwoord. Om dubbel boeken te voorkomen wordt er niets opnieuw verstuurd tot dit is uitgezocht.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => run(false)}>{t("Zoek terug in Holded")}</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(true)}>{t("Ik heb gekeken: hij staat niet in Holded")}</Button>
        </div>
        {msg && <p className="text-muted">{msg}</p>}
      </CardContent>
    </Card>
  );
}
