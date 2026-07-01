import { asc, desc, inArray } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
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
import { db } from "@/lib/db";
import { commissionEntries, contacts, documents, referrals } from "@/lib/db/schema";
import { ensureCommissions } from "@/lib/commission";
import { formatEUR } from "@/lib/utils";
import { createReferral, deleteReferral, toggleReferral, updateReferral } from "./actions";

export const metadata = { title: "Commissies" };

const COMM_TONE = { pending: "warning", approved: "info", paid: "success" } as const;
const COMM_LABEL = { pending: "Openstaand", approved: "Goedgekeurd", paid: "Uitbetaald" } as const;

export default async function CommissiesPage() {
  await ensureCommissions();

  const [refs, entries, contactRows] = await Promise.all([
    db.select().from(referrals).orderBy(desc(referrals.createdAt)),
    db.select().from(commissionEntries).orderBy(desc(commissionEntries.createdAt)),
    db.select({ id: contacts.id, name: contacts.name }).from(contacts).orderBy(asc(contacts.name)),
  ]);

  const nameById = new Map(contactRows.map((c) => [c.id, c.name]));
  const refById = new Map(refs.map((r) => [r.id, r]));
  const docIds = entries.map((e) => e.documentId).filter((x): x is string => !!x);
  const docRows = docIds.length ? await db.select({ id: documents.id, docNumber: documents.docNumber }).from(documents).where(inArray(documents.id, docIds)) : [];
  const docById = new Map(docRows.map((d) => [d.id, d.docNumber]));

  const contactOptions: ComboOption[] = contactRows.map((c) => ({ value: c.id, label: c.name }));
  const totalCommission = entries.reduce((s, e) => s + Number(e.amountEur), 0);
  const openCommission = entries.filter((e) => e.status !== "paid").reduce((s, e) => s + Number(e.amountEur), 0);

  return (
    <>
      <PageHeader title="Commissies" subtitle="Aanbreng-relaties: wie bracht wie, en wat verdient de aanbrenger" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Aanbreng-relaties" value={String(refs.length)} tone="neutral" />
        <StatTile label="Commissie totaal" value={formatEUR(totalCommission)} hint="ex. btw" tone={totalCommission ? "info" : "neutral"} />
        <StatTile label="Nog uit te betalen" value={formatEUR(openCommission)} tone={openCommission ? "warning" : "neutral"} />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Nieuwe aanbreng-relatie</CardTitle>
          <span className="text-xs text-muted">de aanbrenger verdient een % op de facturen van de aangebrachte klant</span>
        </CardHeader>
        <form action={createReferral} className="grid gap-3 px-5 pb-5 lg:grid-cols-[1.4fr_1.4fr_1fr_0.8fr_0.8fr_auto] lg:items-end">
          <Field label="Aanbrenger (bedrijf A / aannemer)">
            <Combobox name="referrerContactId" options={contactOptions} placeholder="zoek contact…" />
          </Field>
          <Field label="Aangebrachte klant (bedrijf B / particulier)">
            <Combobox name="refereeContactId" options={contactOptions} placeholder="zoek contact…" />
          </Field>
          <Field label="Soort">
            <Select name="scope" defaultValue="business">
              <option value="business">Zakelijk (bedrijf brengt bedrijf)</option>
              <option value="particulier">Particulier (aannemer brengt particulier)</option>
            </Select>
          </Field>
          <Field label="Commissie %">
            <Input name="commissionPct" inputMode="decimal" placeholder="5" className="text-right" />
          </Field>
          <Field label="Klantkorting % (particulier)">
            <Input name="customerDiscountPct" inputMode="decimal" placeholder="0" className="text-right" />
          </Field>
          <SubmitButton size="sm" variant="secondary" pendingLabel="…">+ Toevoegen</SubmitButton>
        </form>
      </Card>

      <Card className="mb-5 overflow-hidden">
        <CardHeader>
          <CardTitle>Aanbreng-relaties</CardTitle>
        </CardHeader>
        {refs.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Nog geen relaties.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Aanbrenger</Th>
                <Th>Aangebrachte klant</Th>
                <Th>Soort</Th>
                <Th className="text-right">Commissie %</Th>
                <Th className="text-right">Klantkorting %</Th>
                <Th>Actief</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {refs.map((r) => {
                const fid = `ref-${r.id}`;
                return (
                  <Tr key={r.id}>
                    <Td>{nameById.get(r.referrerContactId) ?? "—"}</Td>
                    <Td>{nameById.get(r.refereeContactId) ?? "—"}</Td>
                    <Td><Badge tone={r.scope === "particulier" ? "warning" : "info"}>{r.scope === "particulier" ? "Particulier" : "Zakelijk"}</Badge></Td>
                    <Td className="text-right">
                      <Input form={fid} name="commissionPct" defaultValue={String(Number(r.commissionPct))} inputMode="decimal" className="h-8 w-16 px-2 py-1 text-right" />
                    </Td>
                    <Td className="text-right">
                      <Input form={fid} name="customerDiscountPct" defaultValue={String(Number(r.customerDiscountPct))} inputMode="decimal" className="h-8 w-16 px-2 py-1 text-right" />
                    </Td>
                    <Td>
                      {r.active ? (
                        <form action={toggleReferral.bind(null, r.id, false)}><SubmitButton size="sm" variant="ghost" className="text-success" pendingLabel="…">✓ actief</SubmitButton></form>
                      ) : (
                        <form action={toggleReferral.bind(null, r.id, true)}><SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">uit</SubmitButton></form>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <form id={fid} action={updateReferral.bind(null, r.id)}>
                          <SubmitButton size="sm" variant="secondary" pendingLabel="…">opslaan</SubmitButton>
                        </form>
                        <form action={deleteReferral.bind(null, r.id)}>
                          <SubmitButton size="sm" variant="ghost" className="text-muted" pendingLabel="…">×</SubmitButton>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Verdiende commissie</CardTitle>
          <span className="text-xs text-muted">per factuur van een aangebrachte klant</span>
        </CardHeader>
        {entries.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">Nog geen commissie — ontstaat zodra een aangebrachte klant een factuur krijgt.</div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Aanbrenger</Th>
                <Th>Klant</Th>
                <Th>Factuur</Th>
                <Th className="text-right">Basis</Th>
                <Th className="text-right">%</Th>
                <Th className="text-right">Commissie</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {entries.map((e) => {
                const ref = refById.get(e.referralId);
                return (
                  <Tr key={e.id}>
                    <Td>{ref ? nameById.get(ref.referrerContactId) ?? "—" : "—"}</Td>
                    <Td>{ref ? nameById.get(ref.refereeContactId) ?? "—" : "—"}</Td>
                    <Td>
                      {e.documentId ? (
                        <Link href={`/documents/${e.documentId}`} className="text-accent hover:underline">{docById.get(e.documentId) ?? "factuur"}</Link>
                      ) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{formatEUR(e.baseAmountEur)}</Td>
                    <Td className="text-right tabular-nums text-muted">{Number(e.pct)}%</Td>
                    <Td className="text-right tabular-nums font-medium">{formatEUR(e.amountEur)}</Td>
                    <Td><Badge tone={COMM_TONE[e.status]}>{COMM_LABEL[e.status]}</Badge></Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
