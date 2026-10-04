"use client";
import { useActionState } from 'react';
import { useT } from '@/components/taal-provider';
import { excludeFollowup,restoreFollowup,type Result } from './actions';
export function FollowupExclude({id,restore=false}:{id:string;restore?:boolean}){
 const t=useT(),[state,action,pending]=useActionState(restore?restoreFollowup:excludeFollowup,{} as Result);
 return <form action={action} className="mt-2"><input type="hidden" name="contactId" value={id}/><button disabled={pending} className="text-xs text-muted underline underline-offset-4 hover:text-accent disabled:opacity-50">{t(restore?'Opvolging hervatten':'Uit werklijst halen')}</button>{state.error&&<p role="alert" className="text-xs text-danger">{t(state.error)}</p>}{state.success&&<p role="status" className="text-xs text-success">{t(state.success)}</p>}</form>;
}
