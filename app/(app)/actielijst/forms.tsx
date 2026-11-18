"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/taal-provider";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ACTIE_STATUSSEN, type ActieStatus } from "@/lib/actielijst";
import { bewaarActiepunt, plaatsOpmerking, zetActieArchief, zetActieKlaar, type ActieResult } from "./actions";

type Teamlid = { id: string; name: string | null; email: string };
type Punt = { id: string; groupName: string; subgroup: string | null; title: string; description: string | null; assigneeId: string | null; teamwide: boolean; helpers: string | null; dueDate: string | null; status: ActieStatus };

const STATUS_LABEL: Record<ActieStatus, string> = { open: "Open", in_progress: "Bezig", done: "Klaar" };

/**
 * Eén formulier voor een nieuw punt en voor het bijwerken ervan. Groep en
 * subgroep zijn vrije tekst met de bestaande namen als suggestie: zo groeit de
 * indeling mee zonder beheerpagina, maar blijft "Showroom" één groep en niet
 * drie varianten met een hoofdletter verschil.
 */
export function ActiepuntForm({ submissionId, punt, team, indeling, vandaag, sluitHref }: { submissionId: string; punt?: Punt; team: Teamlid[]; indeling: { groepen: string[]; subgroepen: string[] }; vandaag: string; sluitHref: string }) {
  const t = useT(), router = useRouter(), [state, action, pending] = useActionState(bewaarActiepunt, {} as ActieResult);
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="id" value={punt?.id ?? submissionId}/><input type="hidden" name="nieuw" value={punt ? "0" : "1"}/>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("Groep")} htmlFor="actie-groep" hint={t("Bijvoorbeeld: Showroom, Magazijn, Logistiek, Social media")}>
        <Input id="actie-groep" name="groupName" list="actie-groepen" required minLength={2} maxLength={60} defaultValue={punt?.groupName ?? ""}/>
        <datalist id="actie-groepen">{indeling.groepen.map(g => <option key={g} value={g}/>)}</datalist>
      </Field>
      <Field label={t("Subgroep (optioneel)")} htmlFor="actie-subgroep" hint={t("Bijvoorbeeld: Stalen, Voorraadtelling, Signing")}>
        <Input id="actie-subgroep" name="subgroup" list="actie-subgroepen" maxLength={60} defaultValue={punt?.subgroup ?? ""}/>
        <datalist id="actie-subgroepen">{indeling.subgroepen.map(g => <option key={g} value={g}/>)}</datalist>
      </Field>
    </div>
    <Field label={t("Actiepunt")} htmlFor="actie-titel"><Input id="actie-titel" name="title" required minLength={3} maxLength={200} defaultValue={punt?.title ?? ""} placeholder={t("Bijvoorbeeld: stalenkast opruimen en ordenen")}/></Field>
    <Field label={t("Toelichting (optioneel)")} htmlFor="actie-toelichting"><Textarea id="actie-toelichting" name="description" rows={3} maxLength={4000} defaultValue={punt?.description ?? ""}/></Field>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t("Wie pakt het op?")} htmlFor="actie-wie">
        <Select id="actie-wie" name="assigneeId" defaultValue={punt?.teamwide ? "team" : punt?.assigneeId ?? ""}>
          <option value="">{t("Nog niemand")}</option>
          <option value="team">{t("Hele team")}</option>
          {team.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </Select>
      </Field>
      <Field label={t("Deadline")} htmlFor="actie-deadline"><Input id="actie-deadline" name="dueDate" type="date" min="2000-01-01" max="2100-12-31" defaultValue={punt?.dueDate ?? ""}/></Field>
      <Field label={t("Status")} htmlFor="actie-status"><Select id="actie-status" name="status" defaultValue={punt?.status ?? "open"}>{ACTIE_STATUSSEN.map(s => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}</Select></Field>
    </div>
    <Field label={t("Samen met (optioneel)")} htmlFor="actie-samen" hint={t("Wie er verder bij nodig is — ook iemand buiten het CRM.")}><Input id="actie-samen" name="helpers" maxLength={200} defaultValue={punt?.helpers ?? ""}/></Field>
    <p className="text-xs leading-relaxed text-muted">{t("Staat de deadline op {datum} of eerder en is het punt dan nog niet afgevinkt, dan krijgt de verantwoordelijke daarover een aparte mail. Tijdzone: Madrid.", { datum: vandaag })}</p>
    <p className="text-xs leading-relaxed text-muted">{t("Bij ‘Hele team’ krijgt iedereen die de lijst bijhoudt die mail, en staat het punt bij iedereen onder ‘van mij’.")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{pending ? t("Opslaan…") : punt ? t("Wijzigingen opslaan") : t("Actiepunt toevoegen")}</button>
      {!punt && <button type="button" onClick={() => { router.replace(sluitHref, { scroll: false }); router.refresh(); }} className="rounded-lg border border-border px-4 py-2 text-sm">{t("Sluiten")}</button>}
    </div>
    {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
    {state.success && <p role="status" className="text-sm text-success">{t(state.success)}</p>}
  </form>;
}

/** Het vinkje in de lijst: afvinken en terugzetten, zonder formulier. */
export function ActieKlaarVinkje({ id, titel, klaar }: { id: string; titel: string; klaar: boolean }) {
  const router = useRouter(), t = useT(), [pending, startTransition] = useTransition(), [fout, setFout] = useState(false);
  function wissel() {
    if (pending) return;
    setFout(false);
    startTransition(async () => {
      try { const uit = await zetActieKlaar({ id, klaar: !klaar }); if (uit.error) { setFout(true); return; } router.refresh(); }
      catch { setFout(true); }
    });
  }
  const label = t(klaar ? "Terugzetten: {taak}" : "Afvinken: {taak}", { taak: titel });
  return <>
    <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-accent/10" title={label}>
      <input type="checkbox" aria-label={label} checked={klaar} disabled={pending} onChange={wissel} className="size-5 cursor-pointer accent-accent disabled:cursor-wait"/>
    </label>
    {fout && <p role="alert" className="text-xs text-danger">{t("Actiepunt niet bijgewerkt. Probeer het opnieuw.")}</p>}
  </>;
}

export function OpmerkingForm({ itemId }: { itemId: string }) {
  const t = useT(), router = useRouter(), ref = useRef<HTMLFormElement>(null), [state, action, pending] = useActionState(plaatsOpmerking, {} as ActieResult);
  useEffect(() => { if (state.success) { ref.current?.reset(); router.refresh(); } }, [state.success, router]);
  return <form ref={ref} action={action} className="space-y-2">
    <input type="hidden" name="itemId" value={itemId}/>
    <Textarea name="body" rows={2} minLength={2} maxLength={2000} required placeholder={t("Opmerking voor het team…")} aria-label={t("Opmerking")}/>
    <button disabled={pending} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{pending ? t("Plaatsen…") : t("Opmerking plaatsen")}</button>
    {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
  </form>;
}

export function ActieArchiefKnop({ id, inArchief, sluitHref }: { id: string; inArchief: boolean; sluitHref: string }) {
  const t = useT(), router = useRouter(), [pending, startTransition] = useTransition(), [fout, setFout] = useState(false);
  function klik() {
    if (pending) return;
    setFout(false);
    startTransition(async () => {
      try { const uit = await zetActieArchief({ id, archief: !inArchief }); if (uit.error) { setFout(true); return; } router.replace(sluitHref, { scroll: false }); router.refresh(); }
      catch { setFout(true); }
    });
  }
  return <>
    <button type="button" onClick={klik} disabled={pending} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{inArchief ? t("Terugzetten in de lijst") : t("Uit de lijst halen")}</button>
    {fout && <p role="alert" className="text-sm text-danger">{t("Actiepunt niet bijgewerkt. Probeer het opnieuw.")}</p>}
  </>;
}

/** De persoonlijke link kopiëren — op de telefoon is dat de hele bediening. */
export function LinkKopieerKnop({ url }: { url: string }) {
  const t = useT(), [stand, setStand] = useState<"klaar" | "gekopieerd" | "fout">("klaar");
  async function kopieer() {
    try { await navigator.clipboard.writeText(url); setStand("gekopieerd"); }
    catch { setStand("fout"); }
  }
  return <button type="button" onClick={kopieer} className="rounded-lg border border-border px-3 py-2 text-sm">
    {stand === "gekopieerd" ? t("Gekopieerd") : stand === "fout" ? t("Kopiëren lukte niet — selecteer de link zelf") : t("Link kopiëren")}
  </button>;
}
