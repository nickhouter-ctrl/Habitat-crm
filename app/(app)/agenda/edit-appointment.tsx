"use client";
import { useActionState, useState } from "react";
import { ActionDialog } from "@/components/action-dialog";
import { Field, Input, Textarea } from "@/components/ui";
import { useT } from "@/components/taal-provider";
import { editAppointment } from "./actions";
import { AttendeePicker } from "./forms";

export function EditAppointment({ appointment, team }: { appointment: {
  id: string; title: string; updatedAt: string; date: string; time: string;
  endDate: string; endTime: string; allDay: boolean; location: string; notes: string;
  assigneeId: string | null; attendeeIds: string[];
}; team: { id: string; name: string | null; email: string }[] }) {
  const t = useT(), [allDay, setAllDay] = useState(appointment.allDay);
  const [state, action, pending] = useActionState(editAppointment, {} as { error?: string; success?: string });
  return <ActionDialog title={t("Afspraak wijzigen")} trigger={t("Wijzigen")}>
    <form action={action} className="space-y-3"><fieldset disabled={pending || !!state.success} className="space-y-3">
      <input type="hidden" name="id" value={appointment.id}/><input type="hidden" name="updatedAt" value={appointment.updatedAt}/>
      <Field label={t("Titel")}><Input aria-label={t("Titel")} name="title" required maxLength={250} defaultValue={appointment.title}/></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allDay" checked={allDay} onChange={e => setAllDay(e.target.checked)}/>{t("Hele dag")}</label>
      <div className="grid grid-cols-2 gap-3"><Field label={t("Begindatum")}><Input aria-label={t("Begindatum")} name="date" type="date" required defaultValue={appointment.date}/></Field><Field label={t("Einddatum")}><Input aria-label={t("Einddatum")} name="endDate" type="date" required defaultValue={appointment.endDate}/></Field></div>
      <div className={allDay ? "hidden" : "grid grid-cols-2 gap-3"}><Field label={t("Begintijd")}><Input aria-label={t("Begintijd")} name="time" type="time" required defaultValue={appointment.time}/></Field><Field label={t("Eindtijd")}><Input aria-label={t("Eindtijd")} name="endTime" type="time" required defaultValue={appointment.endTime}/></Field></div>
      <Field label={t("Locatie")}><Input aria-label={t("Locatie")} name="location" maxLength={500} defaultValue={appointment.location}/></Field>
      <Field label={t("Toelichting")}><Textarea aria-label={t("Toelichting")} name="notes" maxLength={5000} defaultValue={appointment.notes}/></Field>
      {team.length > 1 && <><input type="hidden" name="attendeesSet" value="1"/><AttendeePicker team={team} defaultIds={appointment.attendeeIds} excludeId={appointment.assigneeId}/></>}
      <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">{t(pending ? "Bezig…" : "Opslaan")}</button>
    </fieldset>{state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}{state.success && <p role="status" className="text-sm text-success">{t(state.success)}</p>}</form>
  </ActionDialog>;
}
