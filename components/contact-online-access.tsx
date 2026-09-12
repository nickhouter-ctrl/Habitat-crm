import Link from "next/link";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAccounts } from "@/lib/db/schema";
import { Badge, Card, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createAccountForContact, resendActivation, setWindowsAccess } from "@/app/(app)/accounts/actions";

export async function ContactOnlineAccess({contactId,email}:{contactId:string;email:string|null}) {
 const account=await db.query.customerAccounts.findFirst({where:or(eq(customerAccounts.contactId,contactId),email ? sql`lower(${customerAccounts.email}) = ${email.trim().toLowerCase()}` : undefined)});
 const conflict=account?.contactId && account.contactId!==contactId;
 const linked=account?.contactId===contactId;
 const rows=account ? await db.execute<{allowed:boolean}>(sql`select exists(select 1 from windows.dealers where portal_account_id=${account.id} and status='active' and access_approved_at is not null) as allowed`) : [];
 const allowed=rows[0]?.allowed===true;
 const invitation=(system:"website"|"windows")=><form action={createAccountForContact.bind(null,contactId)} className="mt-3 flex flex-wrap items-center gap-2"><input type="hidden" name="system" value={system}/>{!account&&<Select name="tier" aria-label="Prijsniveau website" defaultValue="particulier"><option value="particulier">Particulier</option><option value="aannemer">Zakelijk</option></Select>}<SubmitButton size="sm" variant="secondary">{account ? "Bestaand account koppelen" : system==="windows" ? "Windows-account uitnodigen" : "Websiteaccount uitnodigen"}</SubmitButton></form>;
 return <Card id="online-toegang" className="mb-5"><details><summary className="cursor-pointer px-5 py-4"><span className="mr-4 font-semibold">Online toegang</span><span className="inline-flex flex-wrap gap-2 align-middle"><Badge tone={account?.status==="active"?"success":"neutral"}>Website: {account?.status==="active"?"actief":account?.status==="pending"?"activatie nodig":account?.status==="suspended"?"geblokkeerd":"geen account"}</Badge><Badge tone={allowed?"success":"neutral"}>Windows: {allowed?"toegestaan":"geen toegang"}</Badge></span><span className="ml-3 text-xs text-muted">Beheren</span></summary>
 {conflict ? <p className="px-5 pb-5 text-sm text-warning">Dit e-mailadres is gekoppeld aan een ander contact. <Link href={`/contacts/${account.contactId}#online-toegang`} className="underline">Bekijk de bestaande koppeling</Link>.</p> : <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
 <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Habitat One-website</h3><Badge tone={!account ? "neutral" : account.status==="active" ? "success" : account.status==="pending" ? "warning" : "danger"}>{!account ? "Geen account" : account.status==="active" ? "Actief" : account.status==="pending" ? "Wacht op activatie" : "Account geblokkeerd"}</Badge>
 <p className="mt-2 text-sm text-muted">{account?.email || email || "Voeg eerst een e-mailadres toe aan dit contact."}</p>
 {!linked&&email ? invitation("website") : account&&<form action={resendActivation.bind(null,account.id)} className="mt-3"><SubmitButton size="sm" variant="secondary">{account.status==="pending" ? "Activatiemail versturen" : "Wachtwoordlink versturen"}</SubmitButton></form>}
 </section>
 <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Habitat Windows</h3><Badge tone={allowed ? "success" : "neutral"}>{allowed ? "Windows-toegang toegestaan" : "Geen Windows-toegang"}</Badge><p className="mt-2 text-sm text-muted">Kozijnen configureren, inmeten en offertes maken.</p>
 {account&&linked ? <form className="mt-3" action={setWindowsAccess.bind(null,account.id,!allowed)}><SubmitButton size="sm" variant={allowed?"ghost":"secondary"}>{allowed?"Windows-toegang intrekken":"Windows-toegang toestaan"}</SubmitButton></form> : email ? invitation("windows") : null}
 {account&&account.status!=="active"&&<p className="mt-2 text-xs text-warning">Inloggen kan pas na activatie en zolang het account niet geblokkeerd is.</p>}
 </section>
 </div>}
 <div className="flex flex-wrap gap-4 border-t border-border px-5 py-3 text-sm"><Link className="underline" href={`/accounts?q=${encodeURIComponent(account?.email||email||"")}`}>Website-account beheren</Link><Link className="underline" href={`/windows-accounts?tab=all&q=${encodeURIComponent(account?.email||email||"")}`}>Windows-account beheren</Link></div>
 </details></Card>;
}
