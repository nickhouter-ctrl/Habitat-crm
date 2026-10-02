import { tekst as uiTranslation } from '@/lib/i18n/server';
import Link from "next/link";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAccounts } from "@/lib/db/schema";
import { Badge, Card, Select, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createAccountForContact, resendActivation, setWindowsAccess, setWebsiteAccess } from "@/app/(app)/accounts/actions";

export async function ContactOnlineAccess({contactId,email}:{contactId:string;email:string|null}) {
  const uiT = await uiTranslation();
 const account=await db.query.customerAccounts.findFirst({where:or(eq(customerAccounts.contactId,contactId),email ? sql`lower(${customerAccounts.email}) = ${email.trim().toLowerCase()}` : undefined)});
 const conflict=account?.contactId && account.contactId!==contactId;
 const linked=account?.contactId===contactId;
 const rows=account ? await db.execute<{allowed:boolean}>(sql`select exists(select 1 from windows.dealers where portal_account_id=${account.id} and status='active' and access_approved_at is not null) as allowed`) : [];
 const allowed=rows[0]?.allowed===true;
 const invitation=(system:"website"|"windows")=><form action={createAccountForContact.bind(null,contactId)} className="mt-3 flex flex-wrap items-center gap-2"><input type="hidden" name="system" value={system}/>{system==="windows"&&<><Input name="businessName" placeholder={uiT("Bedrijfsnaam")} aria-label={uiT("Bedrijfsnaam")} defaultValue={account?.businessName||""} required/><Input name="vatNumber" placeholder={uiT("BTW-/IVA-nummer")} aria-label={uiT("BTW-/IVA-nummer")} defaultValue={account?.vatNumber||""} required/></>}{!account&&system==="website"&&<Select name="tier" aria-label={uiT("Prijsniveau website")} defaultValue="particulier"><option value="particulier">{uiT("Particulier")}</option><option value="aannemer">{uiT("Zakelijk")}</option></Select>}<SubmitButton size="sm" variant="secondary">{account ? system==="windows" ? uiT("Gegevens opslaan en Windows toestaan") : uiT("Bestaand account koppelen") : system==="windows" ? uiT("Windows-account uitnodigen") : uiT("Websiteaccount uitnodigen")}</SubmitButton></form>;
 return <Card id="online-toegang" className="mb-5"><details><summary className="cursor-pointer px-5 py-4"><span className="mr-4 font-semibold">{uiT("Online toegang")}</span><span className="inline-flex flex-wrap gap-2 align-middle"><Badge tone={account?.websiteAccess&&account?.status==="active"?"success":"neutral"}>{uiT("Website:")} {!account?.websiteAccess?uiT("geen toegang"):account?.status==="active"?uiT("actief"):account?.status==="pending"?uiT("activatie nodig"):account?.status==="suspended"?uiT("geblokkeerd"):uiT("geen account")}</Badge><Badge tone={allowed?"success":"neutral"}>{uiT("Windows:")} {allowed?uiT("toegestaan"):uiT("geen toegang")}</Badge></span><span className="ml-3 text-xs text-muted">{uiT("Beheren")}</span></summary>
 {conflict ? <p className="px-5 pb-5 text-sm text-warning">{uiT("Dit e-mailadres is gekoppeld aan een ander contact.")} <Link href={`/contacts/${account.contactId}#online-toegang`} className="underline">{uiT("Bekijk de bestaande koppeling")}</Link>.</p> : <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
 <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">{uiT("Habitat One-website")}</h3><Badge tone={!account?.websiteAccess ? "neutral" : account.status==="active" ? "success" : account.status==="pending" ? "warning" : "danger"}>{!account?.websiteAccess ? uiT("Geen website-toegang") : account.status==="active" ? uiT("Actief") : account.status==="pending" ? uiT("Wacht op activatie") : uiT("Account geblokkeerd")}</Badge>
 <p className="mt-2 text-sm text-muted">{account?.email || email || uiT("Voeg eerst een e-mailadres toe aan dit contact.")}</p>
 {linked&&account&&<form action={setWebsiteAccess.bind(null,account.id,!account.websiteAccess)} className="mt-3"><SubmitButton size="sm" variant={account.websiteAccess?"ghost":"secondary"}>{account.websiteAccess?uiT("Website-toegang intrekken"):uiT("Website-toegang toestaan")}</SubmitButton></form>}
 {!linked&&email ? invitation("website") : account&&<form action={resendActivation.bind(null,account.id)} className="mt-3"><SubmitButton size="sm" variant="secondary">{account.status==="pending" ? uiT("Activatiemail versturen") : uiT("Wachtwoordlink versturen")}</SubmitButton></form>}
 </section>
 <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Habitat Windows</h3><Badge tone={allowed ? "success" : "neutral"}>{allowed ? uiT("Windows-toegang toegestaan") : uiT("Geen Windows-toegang")}</Badge><p className="mt-2 text-sm text-muted">{uiT("Kozijnen configureren, inmeten en offertes maken.")}</p>
 {account&&linked&&(!allowed&&(!account.businessName||!account.vatNumber)) ? invitation("windows") : account&&linked ? <form className="mt-3" action={setWindowsAccess.bind(null,account.id,!allowed)}><SubmitButton size="sm" variant={allowed?"ghost":"secondary"}>{allowed?uiT("Windows-toegang intrekken"):uiT("Windows-toegang toestaan")}</SubmitButton></form> : email ? invitation("windows") : null}
 {account&&account.status!=="active"&&<p className="mt-2 text-xs text-warning">{uiT("Inloggen kan pas na activatie en zolang het account niet geblokkeerd is.")}</p>}
 </section>
 </div>}
 <div className="flex flex-wrap gap-4 border-t border-border px-5 py-3 text-sm"><Link className="underline" href={`/accounts?q=${encodeURIComponent(account?.email||email||"")}`}>{uiT("Website-account beheren")}</Link><Link className="underline" href={`/windows-accounts?tab=all&q=${encodeURIComponent(account?.email||email||"")}`}>{uiT("Windows-account beheren")}</Link></div>
 </details></Card>;
}
