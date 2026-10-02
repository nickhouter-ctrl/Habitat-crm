'use client';
import { useT } from '@/components/taal-provider';

import { useActionState, useEffect, useRef } from 'react';
import { setFollowupCompleted, type Result } from './actions';

export function FollowupCheck({ contactId, name, completed, eventId }: { contactId: string; name: string; completed: boolean; eventId: string }) {
 const t=useT();
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState(async (previous: Result, data: FormData) => {
    try { return await setFollowupCompleted(previous, data); }
    catch { return { error: 'De opvolgstatus kon niet worden bewaard. Probeer opnieuw.' }; }
  }, {});
  useEffect(() => { if (state.error) form.current?.reset(); }, [state]);
  return <form action={submit} ref={form}>
    <input type="hidden" name="contactId" value={contactId}/>
    <input type="hidden" name="expectedEventId" value={eventId}/>
    <label className="flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
      <input type="checkbox" name="completed" value="on" defaultChecked={completed} disabled={pending} aria-label={t('Opvolging van {naam} afgehandeld',{naam:name})} onChange={()=>form.current?.requestSubmit()} className="size-5 accent-accent disabled:opacity-50"/>
      <span>{pending?t("Bewaren…"):completed?t("Afgehandeld"):t("Afvinken")}</span>
    </label>
    {state.error&&<p role="alert" className="max-w-56 text-xs text-danger">{t(state.error)}</p>}
  </form>;
}
