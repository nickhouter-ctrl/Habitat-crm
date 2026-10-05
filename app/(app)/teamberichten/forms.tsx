"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/components/taal-provider";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { sendTeamMessage, markTeamMessageRead, type TeamMessageResult } from "./actions";

export function TeamMessageForm({ team, contact, recipientId = "", today, submissionId, currentUserId }: { team: { id: string; name: string | null; email: string }[]; contact?: { id: string; name: string } | null; recipientId?: string; today: string; submissionId:string; currentUserId?: string }) {
  const [makeTask,setMakeTask]=useState(true);
  const [ontvanger,setOntvanger]=useState(recipientId);
  // "Hele team" = iedereen in de lijst behalve jijzelf; de server telt het
  // opnieuw, dit getal staat er alleen zodat je weet hoeveel mensen het krijgen.
  const collegas = team.filter(u => u.id !== currentUserId).length;
  const heleTeam = ontvanger === "team";
  const t = useT(), [state, action, pending] = useActionState(sendTeamMessage, {} as TeamMessageResult);
  return <form action={action} className="space-y-4"><fieldset disabled={pending||!!state.success} className="space-y-4">
    <input type="hidden" name="submissionId" value={submissionId}/><input type="hidden" name="contactId" value={contact?.id ?? ""}/>
    {contact && <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm"><span className="text-muted">{t("Bij deze klant")}: </span><Link className="font-medium text-accent hover:underline" href={`/opvolging/${contact.id}`}>{contact.name}</Link></div>}
    <Field label={t("Voor welke medewerker?")} htmlFor="team-recipient"><Select id="team-recipient" name="recipientId" required value={ontvanger} onChange={e=>setOntvanger(e.target.value)}><option value="">{t("Kies een medewerker")}</option>{collegas > 1 && <option value="team">{t("Hele team ({n} collega's)", { n: collegas })}</option>}{team.map(user => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}</Select></Field>
    <Field label={t("Onderwerp / taak")} htmlFor="team-subject"><Input id="team-subject" name="subject" minLength={3} maxLength={250} required defaultValue={contact ? t("Afspraak plannen met {naam}", { naam: contact.name }) : ""} placeholder={t("Bijvoorbeeld: afspraak maken met de klant")}/></Field>
    <Field label={t("Wat moet er gebeuren?")} htmlFor="team-body"><Textarea id="team-body" name="body" rows={4} minLength={3} maxLength={5000} required placeholder={t("Bijvoorbeeld: Mourad, kun je een afspraak maken met deze klant?")}/></Field>
    <label className="flex items-start gap-3 rounded-lg border border-accent/25 bg-accent/5 p-3 text-sm"><input name="makeTask" type="checkbox" checked={makeTask} onChange={e=>setMakeTask(e.target.checked)} className="mt-1"/><span><span className="block font-medium">{t("Maak hier ook een taak van")}</span><span className="mt-1 block text-xs text-muted">{t(heleTeam ? "Iedere collega krijgt de taak in zijn eigen agenda. Alleen een bericht? Zet het vinkje uit." : "De taak komt bij deze medewerker in de agenda. Alleen een bericht? Zet het vinkje uit.")}</span></span></label>
    <div hidden={!makeTask} className="grid gap-3 sm:grid-cols-3"><Field label={t("Opvolgen op")} htmlFor="team-date"><Input id="team-date" name="dueDate" type="date" defaultValue={today}/></Field><Field label={t("Tijd")} htmlFor="team-time"><Input id="team-time" name="time" type="time" defaultValue="17:00"/></Field><Field label={t("Prioriteit")} htmlFor="team-priority"><Select id="team-priority" name="priority" defaultValue="middel"><option value="hoog">{t("Hoog")}</option><option value="middel">{t("Middel")}</option><option value="laag">{t("Laag")}</option></Select></Field></div>
    <p className="text-xs leading-relaxed text-muted">{t("De ontvanger krijgt een melding in het CRM en een e-mail. Taken met een datum komen ook in het ochtendoverzicht om 08:00. Tijdzone: Madrid.")}</p>
    <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{pending ? t("Versturen…") : heleTeam ? t(makeTask?"Verstuur naar het hele team, met taak":"Verstuur naar het hele team") : t(makeTask?"Verstuur bericht en taak":"Verstuur bericht")}</button>
  </fieldset>{state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}{state.success && <p role="status" className="text-sm text-success">{t(state.success, { n: state.aantal ?? 0 })} {state.messageId && <Link className="underline" href={`/teamberichten?map=sent&bericht=${state.messageId}`}>{t("Bekijk het bericht")}</Link>}</p>}</form>;
}
export function TeamMessageReadReceipt({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => { let active = true; void markTeamMessageRead(id).then(() => { if (active) router.refresh(); }).catch(()=>{}); return () => { active = false; }; }, [id, router]);
  return null;
}
