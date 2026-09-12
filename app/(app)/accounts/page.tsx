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
import {
  approveAccountRequest,
  createAccountManually,
  rejectAccountRequest,
  resendActivation,
  setAccountStatus,
  setAccountTier,
  setWindowsAccess,
} from "./actions";

export const metadata = { title: "Klant-accounts" };

const STATUS_TONE = { pending: "warning", active: "success", suspended: "danger" } as const;
const STATUS_LABEL = { pending: "Wacht op activatie", active: "Actief", suspended: "Geblokkeerd" } as const;

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ source?: string; tab?: string; q?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const source = params.source === "windows" ? "windows" : "website";
  const tab = ["windows", "no-windows", "pending", "suspended"].includes(params.tab ?? "") ? params.tab! : "all";
  const query = (params.q ?? "").trim().slice(0, 200);
  const sort = ["name", "email", "login", "newest"].includes(params.sort ?? "") ? params.sort! : "name";
  const [requests, accounts, contactRows] = await Promise.all([
    db.select().from(accountRequests).where(eq(accountRequests.status, "pending")).orderBy(desc(accountRequests.createdAt)),
    db
      .select({
        id: customerAccounts.id,
        createdAt: customerAccounts.createdAt,
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
  const tabs = [
    { id: "all", label: "Alle accounts", count: accounts.length },
    { id: "windows", label: "Windows-toegang", count: accounts.filter(a => a.windowsAccess).length },
    { id: "no-windows", label: "Zonder Windows", count: accounts.filter(a => !a.windowsAccess).length },
    { id: "pending", label: "Wacht op activatie", count: accounts.filter(a => a.status === "pending").length },
    { id: "suspended", label: "Geblokkeerd", count: accounts.filter(a => a.status === "suspended").length },
  ];
  const name = (a: typeof accounts[number]) => a.businessName || a.contactName || a.email;
  const filtered = accounts.filter(a => {
    if (tab === "windows" && !a.windowsAccess || tab === "no-windows" && a.windowsAccess) return false;
    if ((tab === "pending" || tab === "suspended") && a.status !== tab) return false;
    return !query || [a.email, a.businessName, a.contactName].some(v => v?.toLocaleLowerCase("nl").includes(query.toLocaleLowerCase("nl")));
  }).sort((a, b) => {
    const primary = sort === "email" ? a.email.localeCompare(b.email, "nl")
      : sort === "login" ? (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0)
      : sort === "newest" ? b.createdAt.getTime() - a.createdAt.getTime()
      : name(a).localeCompare(name(b), "nl", { sensitivity: "base" });
    return primary || a.id.localeCompare(b.id);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / 25));
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) ? Math.min(totalPages, Math.max(1, requestedPage)) : 1;
  const visibleAccounts = filtered.slice((page - 1) * 25, page * 25);
  function href(change: Record<string, string>) {
    const values = new URLSearchParams({ tab, q: query, sort, ...(source ? { source } : {}), ...change });
    return `/accounts?${values}#account-list`;
  }
  const activeCount = accounts.filter((a) => a.status === "active").length;
  const dt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—");

  return (
    <>
      <PageHeader title="Klant-accounts" subtitle="Accountaanvragen voor Habitat One en het kozijnensysteem" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Openstaande aanvragen" value={String(requests.length)} tone={requests.length ? "warning" : "neutral"} />
        <StatTile label="Actieve accounts" value={String(activeCount)} tone={activeCount ? "success" : "neutral"} />
        <StatTile label="Totaal accounts" value={String(accounts.length)} tone="neutral" />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Handmatig account aanmaken</CardTitle>
          <span className="text-xs text-muted">kies een bestaand contact (e-mail volgt) of vul zelf een e-mail in · de klant krijgt een activatiemail</span>
        </CardHeader>
        <form action={createAccountManually} className="grid gap-3 px-5 pb-5 lg:grid-cols-[1.6fr_1.4fr_1fr_auto] lg:items-end">
          <Field label="Bestaand contact (optioneel)">
            <Combobox name="contactId" options={contactOptions} placeholder="zoek contact…" clearable />
          </Field>
          <Field label="E-mail (indien geen contact)">
            <Input name="email" type="email" placeholder="klant@voorbeeld.nl" />
          </Field>
          <Field label="Prijsniveau">
            <Select name="tier" defaultValue="particulier">
              <option value="particulier">Particulier</option>
              <option value="aannemer">Aannemer (−20%)</option>
            </Select>
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Account</SubmitButton>
        </form>
      </Card>

      <section id="account-requests" className="mb-4">
        <h2 className="mb-2 text-lg font-semibold">Accountaanvragen</h2>
        <nav className="flex flex-wrap gap-2" aria-label="Soort accountaanvraag">
          {[{id:"website", label:"Website-aanvragen"}, {id:"windows", label:"Windows-accountaanvragen"}].map(t => <Link key={t.id} href={href({ source:t.id }).replace("#account-list", "#account-requests")} aria-current={source === t.id ? "page" : undefined} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${source === t.id ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground"}`}>{t.label} <span className="ml-2 tabular-nums">{requests.filter(r => r.source === t.id).length}</span></Link>)}
        </nav>
      </section>
      <Card className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>{source === "windows" ? "Windows-accountaanvragen" : "Website-aanvragen"}</CardTitle>
          <span className="text-xs text-muted">{source === "windows" ? "Goedkeuren geeft toegang tot Habitat Windows. Kies het prijsniveau voor het gekoppelde account." : "Goedkeuren maakt een website-account aan. Windows-toegang blijft een aparte keuze."}</span>
        </CardHeader>
        {visibleRequests.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Geen openstaande {source === "windows" ? "Windows-accountaanvragen" : "website-aanvragen"}.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Naam / bedrijf</Th>
                <Th>Contact</Th>
                <Th>Aanvraag</Th>
                <Th>Type</Th>
                <Th>IVA/BTW</Th>
                <Th>Goedkeuren als</Th>
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
                  <Td><Badge tone={r.source === "windows" ? "info" : "neutral"}>{r.source === "windows" ? "Aanvraag kozijnensysteem" : "Website-account"}</Badge>{r.message && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted">{r.message}</p>}</Td>
                  <Td><Badge tone={r.kind === "zakelijk" ? "info" : "neutral"}>{r.kind === "zakelijk" ? "Zakelijk" : "Particulier"}</Badge></Td>
                  <Td className="text-xs">{r.vatNumber ?? "—"}</Td>
                  <Td>
                    <form action={approveAccountRequest.bind(null, r.id)} className="flex items-center gap-2">
                      <Select name="tier" defaultValue={r.kind === "zakelijk" ? "aannemer" : "particulier"} className="h-8 py-1 text-xs">
                        <option value="particulier">Particulier (normale prijs)</option>
                        <option value="aannemer">Aannemer (−20%)</option>
                      </Select>
                      <SubmitButton size="sm" variant="primary" pendingLabel="…">Goedkeuren</SubmitButton>
                    </form>
                  </Td>
                  <Td className="text-right">
                    <form action={rejectAccountRequest.bind(null, r.id)}>
                      <SubmitButton size="sm" variant="ghost" className="text-danger" pendingLabel="…">Afwijzen</SubmitButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden" id="account-list">
        <CardHeader><CardTitle>Accounts</CardTitle><span className="text-sm text-muted">{filtered.length} van {accounts.length} accounts</span></CardHeader>
        <div className="space-y-4 px-5 pb-5">
          <p className="text-sm text-muted">Windows-toegang wordt apart toegestaan. Een account moet ook geactiveerd en niet geblokkeerd zijn om te kunnen inloggen.</p>
          <nav className="flex flex-wrap gap-2" aria-label="Accounts filteren">
            {tabs.map(t => <Link key={t.id} href={href({ tab: t.id, page: "1" })} aria-current={tab === t.id ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm font-medium ${tab === t.id ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground"}`}>{t.label} <span className="ml-1 tabular-nums">{t.count}</span></Link>)}
          </nav>
          <form action="/accounts#account-list" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tab}/>{source && <input type="hidden" name="source" value={source}/>}
            <Field label="Zoek account" className="min-w-56 flex-1"><Input name="q" defaultValue={query} placeholder="Naam, bedrijf of e-mailadres" /></Field>
            <Field label="Sorteren"><Select name="sort" defaultValue={sort}><option value="name">Naam A–Z</option><option value="email">E-mail A–Z</option><option value="login">Laatste login eerst</option><option value="newest">Nieuwste accounts eerst</option></Select></Field>
            <Button type="submit" variant="secondary">Toepassen</Button>
            {query && <Link href={href({ q: "", page: "1" })} className="py-2 text-sm underline">Zoekopdracht wissen</Link>}
          </form>
        </div>
        {visibleAccounts.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Geen accounts gevonden voor deze selectie.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>E-mail / bedrijf</Th>
                <Th>Prijsniveau website</Th>
                <Th>Status</Th>
                <Th>Habitat Windows</Th>
                <Th>Laatste login</Th>
                <Th>Acties</Th>
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
                    <span className="block text-xs text-muted">{a.email}</span>
                  </Td>
                  <Td>
                    <AccountTierSelect accountId={a.id} tier={a.tier} onChangeAction={setAccountTier} />
                  </Td>
                  <Td><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></Td>
                  <Td><form action={setWindowsAccess.bind(null, a.id, !a.windowsAccess)} className="flex flex-col items-start gap-2">
                    <Badge tone={a.windowsAccess ? "success" : "neutral"}>{a.windowsAccess ? "Windows toegestaan" : "Geen Windows-toegang"}</Badge>
                    <SubmitButton size="sm" variant={a.windowsAccess ? "ghost" : "secondary"} pendingLabel="Opslaan…">{a.windowsAccess ? "Toegang intrekken" : "Windows-toegang toestaan"}</SubmitButton>
                  </form></Td>
                  <Td className="text-xs text-muted">{dt(a.lastLoginAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={resendActivation.bind(null, a.id)}>
                        <SubmitButton size="sm" variant="ghost" className="text-accent" pendingLabel="…">activatie/reset</SubmitButton>
                      </form>
                      {a.status === "suspended" ? (
                        <form action={setAccountStatus.bind(null, a.id, "active")}>
                          <SubmitButton size="sm" variant="ghost" className="text-success" pendingLabel="…">activeren</SubmitButton>
                        </form>
                      ) : (
                        <form action={setAccountStatus.bind(null, a.id, "suspended")}>
                          <SubmitButton size="sm" variant="ghost" className="text-danger" pendingLabel="…">blokkeren</SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {totalPages > 1 && <nav aria-label="Accountpagina’s" className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="underline">Vorige</Link> : <span/>}
          <span>Pagina {page} van {totalPages}</span>
          {page < totalPages ? <Link href={href({ page: String(page + 1) })} className="underline">Volgende</Link> : <span/>}
        </nav>}
      </Card>
    </>
  );
}
