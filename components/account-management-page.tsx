import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
import { WindowsAccountCreate } from "@/components/windows-account-create";
import { accountList, accountStatus } from "@/lib/portal/account-list";
import { asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
  StatTile,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Combobox, type ComboOption } from "@/components/combobox";
import { AccountTierSelect } from "@/components/account-tier-select";
import { db } from "@/lib/db";
import { accountRequests, contacts, customerAccounts } from "@/lib/db/schema";
import { getWindowsDealers } from "@/lib/windows-report";
import {
  approveAccountRequest,
  createAccountManually,
  rejectAccountRequest,
  resendActivation,
  resendWindowsActivation,
  setAccountStatus,
  setAccountTier,
  setWindowsAccess,
  setWebsiteAccess,
} from "@/app/(app)/accounts/actions";



const STATUS_TONE = { pending: "warning", active: "success", suspended: "danger" } as const;
const STATUS_LABEL = { pending: "Wacht op activatie", active: "Actief", suspended: "Geblokkeerd" } as const;

export default async function AccountsPage({ searchParams, windowsPage = false }: { windowsPage?: boolean; searchParams: Promise<{ source?: string; tab?: string; q?: string; sort?: string; page?: string }> }) {
  const uiDateLocale = await datumTaal();
  const uiT = await uiTranslation();
  const params = await searchParams;
  const windowsDealers = await getWindowsDealers();
  const source = windowsPage ? "windows" : "website";
  const basePath = windowsPage ? "/windows-accounts" : "/accounts";
  const [requests, accounts, contactRows] = await Promise.all([
    db.select().from(accountRequests).where(eq(accountRequests.status, "pending")).orderBy(desc(accountRequests.createdAt)),
    db
      .select({
        id: customerAccounts.id,
        websiteAccess: customerAccounts.websiteAccess,
        createdAt: customerAccounts.createdAt,
        windowsApproved: sql<boolean>`exists (select 1 from windows.dealers d where d.portal_account_id = ${customerAccounts.id}::text and d.access_approved_at is not null)`,
        windowsAccess: sql<boolean>`exists (select 1 from windows.dealers d where d.portal_account_id = ${customerAccounts.id}::text and d.access_approved_at is not null and d.status = 'active')`,
        email: customerAccounts.email,
        tier: customerAccounts.priceTier,
        status: customerAccounts.status,
        businessName: customerAccounts.businessName,
        vatNumber: customerAccounts.vatNumber,
        lastLoginAt: customerAccounts.lastLoginAt,
        contactId: customerAccounts.contactId,
        contactName: contacts.name,
      })
      .from(customerAccounts)
      .leftJoin(contacts, eq(customerAccounts.contactId, contacts.id))
      .orderBy(asc(customerAccounts.status), desc(customerAccounts.createdAt)),
    db.select({ id: contacts.id, name: contacts.name, email: contacts.email }).from(contacts).orderBy(asc(contacts.name)),
  ]);

  const visibleRequests = source === "windows" || source === "website" ? requests.filter(r => r.source === source) : requests;
  const contactOptions: ComboOption[] = contactRows.map((c) => ({
    value: c.id,
    label: c.name,
    hint: c.email ?? "geen e-mail",
  }));
  const {scoped, tab, query, sort, filtered, totalPages, page, tabs, visibleAccounts} = accountList(accounts, windowsPage, params);
  function href(change: Record<string, string>) {
    const values = new URLSearchParams({ tab, q: query, sort, ...(source ? { source } : {}), ...change });
    return `${basePath}?${values}#account-list`;
  }
  const activeCount = scoped.filter(a => accountStatus(a, windowsPage) === "active").length;
  const dt = (d: Date | null) => (d ? new Date(d).toLocaleDateString(uiDateLocale, { day: "numeric", month: "short", year: "numeric" }) : "—");

  return (
    <>
      <PageHeader title={windowsPage ? uiT("Windows-accounts") : uiT("Website-accounts")} subtitle={windowsPage ? uiT("Toegang en aanvragen voor het kozijnensysteem") : uiT("Klantaccounts voor de Habitat One-website")} />


      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={uiT("Openstaande aanvragen")} value={String(visibleRequests.length)} tone={visibleRequests.length ? "warning" : "neutral"} />
        <StatTile label={uiT("Actieve accounts")} value={String(activeCount)} tone={activeCount ? "success" : "neutral"} />
        <StatTile label={windowsPage ? uiT("Windows-accounts") : uiT("Totaal accounts")} value={String(scoped.length)} tone="neutral" />
      </div>

      {!windowsPage && <Card className="mb-5"><details><summary className="cursor-pointer px-5 py-4 text-sm font-semibold">{uiT("+ Websiteaccount aanmaken")}</summary>
        <CardHeader>
          <CardTitle>{uiT("Handmatig account aanmaken")}</CardTitle>
          <span className="text-xs text-muted">{uiT("kies een bestaand contact (e-mail volgt) of vul zelf een e-mail in · de klant krijgt een activatiemail")}</span>
        </CardHeader>
        <form action={createAccountManually} className="grid gap-3 px-5 pb-5 lg:grid-cols-[1.6fr_1.4fr_1fr_auto] lg:items-end">
          <Field label={uiT("Bestaand contact (optioneel)")}>
            <Combobox name="contactId" options={contactOptions} placeholder={uiT("zoek contact…")} clearable />
          </Field>
          <Field label={uiT("E-mail (indien geen contact)")}>
            <Input name="email" type="email" placeholder={uiT("klant@voorbeeld.nl")} />
          </Field>
          <Field label={uiT("Prijsniveau")}>
            <Select name="tier" defaultValue="particulier">
              <option value="particulier">{uiT("Particulier")}</option>
              <option value="aannemer">{uiT("Aannemer (−20%)")}</option>
            </Select>
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">{uiT("+ Account")}</SubmitButton>
        </form>
      </details></Card>}

      {windowsPage && <WindowsAccountCreate />}
      {windowsPage && <p className="mb-5 text-sm text-muted">{uiT("Geef een bestaande klant toegang via")} <Link className="underline" href="/contacts">{uiT("Contacten → Online toegang")}</Link>.</p>}
      <Card id="account-requests" className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>{source === "windows" ? uiT("Windows-accountaanvragen") : uiT("Website-aanvragen")}</CardTitle>
          <span className="text-xs text-muted">{source === "windows" ? uiT("Goedkeuren geeft toegang tot Habitat Windows. Kies het prijsniveau voor het gekoppelde account.") : uiT("Goedkeuren maakt een website-account aan. Windows-toegang blijft een aparte keuze.")}</span>
        </CardHeader>
        {visibleRequests.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">{uiT("Geen openstaande")} {source === "windows" ? uiT("Windows-accountaanvragen") : uiT("website-aanvragen")}.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>{uiT("Naam / bedrijf")}</Th>
                <Th>{uiT("Contact")}</Th>
                <Th>{uiT("Aanvraag")}</Th>
                <Th>{uiT("Type")}</Th>
                <Th>{uiT("IVA/BTW")}</Th>
                <Th>{uiT("Goedkeuren als")}</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {visibleRequests.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    {r.kind === "zakelijk" && r.businessName ? r.businessName : r.name}
                    {r.kind === "zakelijk" && r.businessName ? <span className="block text-xs text-muted">{r.name}</span> : null}
                  </Td>
                  <Td>
                    {r.email}
                    {r.phone ? <span className="block text-xs text-muted">{r.phone}</span> : null}
                  </Td>
                  <Td><Badge tone={r.source === "windows" ? "info" : "neutral"}>{r.source === "windows" ? uiT("Aanvraag kozijnensysteem") : uiT("Website-account")}</Badge>{r.message && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted">{r.message}</p>}</Td>
                  <Td><Badge tone={r.kind === "zakelijk" ? "info" : "neutral"}>{r.kind === "zakelijk" ? uiT("Zakelijk") : uiT("Particulier")}</Badge></Td>
                  <Td className="text-xs">{r.vatNumber ?? "—"}</Td>
                  <Td>
                    <form action={approveAccountRequest.bind(null, r.id)} className="flex items-center gap-2">
                      <Select name="tier" defaultValue={r.kind === "zakelijk" ? "aannemer" : "particulier"} className="h-8 py-1 text-xs">
                        <option value="particulier">{uiT("Particulier (normale prijs)")}</option>
                        <option value="aannemer">{uiT("Aannemer (−20%)")}</option>
                      </Select>
                      <SubmitButton size="sm" variant="primary" pendingLabel="…">{uiT("Goedkeuren")}</SubmitButton>
                    </form>
                  </Td>
                  <Td className="text-right">
                    <form action={rejectAccountRequest.bind(null, r.id)}>
                      <SubmitButton size="sm" variant="ghost" className="text-danger" pendingLabel="…">{uiT("Afwijzen")}</SubmitButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden" id="account-list">
        <CardHeader><CardTitle>{windowsPage ? uiT("Windows-accounts") : uiT("Website-accounts")}</CardTitle><span className="text-sm text-muted">{filtered.length} {uiT("van")} {scoped.length} {uiT("accounts")}</span></CardHeader>
        <div className="space-y-4 px-5 pb-5">

          <nav className="flex flex-wrap gap-2" aria-label={uiT("Accounts filteren")}>
            {tabs.map(t => <Link key={t.id} href={href({ tab: t.id, page: "1" })} aria-current={tab === t.id ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm font-medium ${tab === t.id ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground"}`}>{uiT(t.label)} <span className="ml-1 tabular-nums">{t.count}</span></Link>)}
          </nav>
          <form action={`${basePath}#account-list`} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tab}/>{source && <input type="hidden" name="source" value={source}/>}
            <Field label={uiT("Zoek account")} className="min-w-56 flex-1"><Input name="q" defaultValue={query} placeholder={uiT("Naam, bedrijf of e-mailadres")} /></Field>
            <Field label={uiT("Sorteren")}><Select name="sort" defaultValue={sort}><option value="name">{uiT("Naam A–Z")}</option><option value="email">{uiT("E-mail A–Z")}</option><option value="login">{uiT("Laatste login eerst")}</option><option value="newest">{uiT("Nieuwste accounts eerst")}</option></Select></Field>
            <Button type="submit" variant="secondary">{uiT("Toepassen")}</Button>
            {query && <Link href={href({ q: "", page: "1" })} className="py-2 text-sm underline">{uiT("Zoekopdracht wissen")}</Link>}
          </form>
        </div>
        {visibleAccounts.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">{uiT("Geen accounts gevonden voor deze selectie.")}</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>{uiT("E-mail / bedrijf")}</Th>
                {!windowsPage && <Th>{uiT("Prijsniveau website")}</Th>}
                <Th>{uiT("Status")}</Th>
                <Th>{uiT("Kozijnen")}</Th>

                <Th>{uiT("Laatste login")}</Th>
                <Th>{uiT("Acties")}</Th>
              </tr>
            </THead>
            <TBody>
              {visibleAccounts.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    {a.contactId ? (
                      <Link href={`/contacts/${a.contactId}`} className="hover:underline">{a.businessName ?? a.contactName ?? a.email}</Link>
                    ) : (
                      a.businessName ?? a.email
                    )}
                    <span className="block text-xs text-muted">{a.email}</span>{!windowsPage && a.windowsApproved && <span className="mt-1 block text-xs text-muted">{uiT("Ook Windows-toegang")}</span>}
                  </Td>
                  {!windowsPage && <Td>
                    <AccountTierSelect accountId={a.id} tier={a.tier} onChangeAction={setAccountTier} />
                  </Td>}
                  <Td><Badge tone={STATUS_TONE[accountStatus(a, windowsPage)]}>{uiT(STATUS_LABEL[accountStatus(a, windowsPage)])}</Badge></Td>
                  <Td>{windowsDealers.filter(d => d.accountId === a.id).map(d => <Link key={d.id} className="block text-xs text-accent hover:underline" href={a.contactId ? `/contacts/${a.contactId}?tab=kozijnen` : `/kozijnen/dealers/${d.id}`}>{uiT("Offertes, orders en totalen →")}</Link>)}</Td>
                  <Td className="text-xs text-muted">{dt(a.lastLoginAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={(windowsPage ? resendWindowsActivation : resendActivation).bind(null, a.id)}>
                        <SubmitButton size="sm" variant="ghost" className="text-accent" pendingLabel={uiT("Versturen…")}>{a.status === "pending" ? uiT("Activatiemail") : uiT("Wachtwoordlink")}</SubmitButton>
                      </form>
                      {!windowsPage && <form action={setWebsiteAccess.bind(null,a.id,false)}><SubmitButton size="sm" variant="ghost" className="text-danger">{uiT("Website-toegang intrekken")}</SubmitButton></form>}
                      {windowsPage ? <form action={setWindowsAccess.bind(null,a.id,!a.windowsAccess)}><SubmitButton size="sm" variant="ghost" className={a.windowsAccess?"text-danger":"text-success"}>{a.windowsAccess?uiT("Windows-toegang intrekken"):uiT("Windows-toegang herstellen")}</SubmitButton></form> : a.status === "suspended" ? (
                        <form action={setAccountStatus.bind(null, a.id, "active")}>
                          <SubmitButton size="sm" variant="ghost" className="text-success" pendingLabel="…">{uiT("activeren")}</SubmitButton>
                        </form>
                      ) : (
                        <form action={setAccountStatus.bind(null, a.id, "suspended")}>
                          <SubmitButton size="sm" variant="ghost" className="text-danger" pendingLabel="…">{uiT("Beide toegangen blokkeren")}</SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {totalPages > 1 && <nav aria-label={uiT("Accountpagina’s")} className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="underline">{uiT("Vorige")}</Link> : <span/>}
          <span>{uiT("Pagina")} {page} {uiT("van")} {totalPages}</span>
          {page < totalPages ? <Link href={href({ page: String(page + 1) })} className="underline">{uiT("Volgende")}</Link> : <span/>}
        </nav>}
      </Card>
    </>
  );
}
