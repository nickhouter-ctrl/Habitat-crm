import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
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
import { db } from "@/lib/db";
import { accountRequests, contacts, customerAccounts } from "@/lib/db/schema";
import {
  approveAccountRequest,
  rejectAccountRequest,
  resendActivation,
  setAccountStatus,
  setAccountTier,
} from "./actions";

export const metadata = { title: "Klant-accounts" };

const STATUS_TONE = { pending: "warning", active: "success", suspended: "danger" } as const;
const STATUS_LABEL = { pending: "Wacht op activatie", active: "Actief", suspended: "Geblokkeerd" } as const;

export default async function AccountsPage() {
  const [requests, accounts] = await Promise.all([
    db.select().from(accountRequests).where(eq(accountRequests.status, "pending")).orderBy(desc(accountRequests.createdAt)),
    db
      .select({
        id: customerAccounts.id,
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
  ]);

  const activeCount = accounts.filter((a) => a.status === "active").length;
  const dt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—");

  return (
    <>
      <PageHeader title="Klant-accounts" subtitle="Website-accounts voor prijzen (particulier / zakelijk)" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Openstaande aanvragen" value={String(requests.length)} tone={requests.length ? "warning" : "neutral"} />
        <StatTile label="Actieve accounts" value={String(activeCount)} tone={activeCount ? "success" : "neutral"} />
        <StatTile label="Totaal accounts" value={String(accounts.length)} tone="neutral" />
      </div>

      <Card className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Openstaande aanvragen</CardTitle>
          <span className="text-xs text-muted">goedkeuren → account + activatiemail; kies het prijsniveau</span>
        </CardHeader>
        {requests.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Geen openstaande aanvragen.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Naam / bedrijf</Th>
                <Th>Contact</Th>
                <Th>Type</Th>
                <Th>IVA/BTW</Th>
                <Th>Goedkeuren als</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {requests.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    {r.kind === "zakelijk" && r.businessName ? r.businessName : r.name}
                    {r.kind === "zakelijk" && r.businessName ? <span className="block text-xs text-muted">{r.name}</span> : null}
                  </Td>
                  <Td>
                    {r.email}
                    {r.phone ? <span className="block text-xs text-muted">{r.phone}</span> : null}
                  </Td>
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

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        {accounts.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Nog geen accounts.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>E-mail / bedrijf</Th>
                <Th>Prijsniveau</Th>
                <Th>Status</Th>
                <Th>Laatste login</Th>
                <Th>Acties</Th>
              </tr>
            </THead>
            <TBody>
              {accounts.map((a) => (
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
                    <form action={setAccountTier.bind(null, a.id)} className="flex items-center gap-1">
                      <Select name="tier" defaultValue={a.tier} className="h-8 py-1 text-xs">
                        <option value="particulier">Particulier</option>
                        <option value="aannemer">Aannemer (−20%)</option>
                      </Select>
                      <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">opslaan</SubmitButton>
                    </form>
                  </Td>
                  <Td><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></Td>
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
      </Card>
    </>
  );
}
