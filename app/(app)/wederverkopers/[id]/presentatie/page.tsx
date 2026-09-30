import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireModuleRead } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { contacts, presentationAgreements, presentationRedemptions, users } from "@/lib/db/schema";
import { Badge, Card, CardHeader, CardTitle, PageHeader, StatTile } from "@/components/ui";
import { formatEUR } from "@/lib/utils";
import { cents, PRESENTATION_MODES, presentationAmounts, type PresentationInput } from "@/lib/presentation";
import { AgreementForm, RedemptionForm, VoidForm } from "./forms";
export const metadata = { title: "Presentatieafspraak" };
export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleRead("producten");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!contact) notFound();
  const [agreement] = await db.select().from(presentationAgreements).where(eq(presentationAgreements.contactId, id));
  const entries = agreement ? await db.select({ entry: presentationRedemptions, name: users.name }).from(presentationRedemptions).leftJoin(users, eq(users.id, presentationRedemptions.createdBy)).where(eq(presentationRedemptions.agreementId, agreement.id)).orderBy(desc(presentationRedemptions.createdAt)) : [];
  const approvedBy = agreement ? await db.query.users.findFirst({ where: eq(users.id, agreement.approvedBy), columns: { name: true } }) : null;
  const mode = (agreement?.mode ?? "first_order") as PresentationInput["mode"];
  const amounts = agreement ? presentationAmounts({ mode, value: cents(agreement.valueEur), contribution: cents(agreement.contributionEur) }) : { contribution: 0, charge: 0, credit: 0 };
  const used = entries.reduce((sum, { entry }) => sum + (entry.voidedAt ? 0 : cents(entry.amountEur)), 0);
  const balance = amounts.credit - used;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const expired = !!agreement?.expiresOn && agreement.expiresOn < today;
  const canWrite = access.heeftCap("schrijven");
  return <>
    <PageHeader title="Presentatieafspraak" subtitle={contact.name} actions={<Link href={`/wederverkopers/${id}`} className="text-sm text-accent">← Terug naar dossier</Link>} />
    <p className="mb-5 max-w-3xl text-sm text-muted">Leg vast hoe jullie meebetalen aan de showroom. Alle bedragen zijn exclusief btw. De afspraak en elke verrekening blijven bij dit contact bewaard.</p>
    {agreement && <><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatTile label="Klantbijdrage" value={formatEUR(amounts.charge / 100)} hint={`Ontvangen: ${formatEUR(agreement.paidEur)}`} /><StatTile label="Bijdrage Habitat One" value={formatEUR(amounts.contribution / 100)} hint={`Werkelijke kostprijs: ${agreement.costEur === null ? "nog niet ingevuld" : formatEUR(agreement.costEur)}`} /><StatTile label="Verrekend" value={formatEUR(used / 100)} /><StatTile label={expired ? "Tegoed verlopen" : "Resterend tegoed"} value={formatEUR(balance / 100)} tone={expired ? "warning" : balance > 0 ? "info" : "neutral"} hint={agreement.expiresOn ? `Geldig t/m ${agreement.expiresOn}` : "Geen vervaldatum afgesproken"} /></div>
    <Card className="mb-5 p-5"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{agreement.title}</h2><Badge tone="neutral">{PRESENTATION_MODES[mode]}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm">{agreement.terms}</p><p className="mt-3 text-xs text-muted">Versie {agreement.version} · laatst vastgelegd door {approvedBy?.name ?? "medewerker"} op {agreement.updatedAt.toLocaleDateString("nl-NL", { timeZone: "Europe/Madrid" })}</p></Card></>}
    {canWrite && <Card className="mb-5 p-5 sm:p-6"><details open={!agreement}><summary className="cursor-pointer font-semibold">{agreement ? "Afspraak aanpassen" : "Nieuwe presentatieafspraak"}</summary><div className="mt-5"><AgreementForm key={agreement?.version ?? 0} contactId={id} initial={{ mode, version: agreement?.version ?? 0, title: agreement?.title ?? "", value: agreement?.valueEur ?? "", contribution: agreement?.contributionEur ?? "0", cost: agreement?.costEur ?? "", paid: agreement?.paidEur ?? "0", rate: agreement?.rate ?? "10", minimumOrder: agreement?.minimumOrderEur ?? "0", remainder: agreement?.remainder ?? "minimum", expires: agreement?.expiresOn ?? "", terms: agreement?.terms ?? "" }} /></div></details></Card>}
    {agreement && canWrite && balance > 0 && !expired && <Card className="mb-5 p-5 sm:p-6"><h2 className="mb-3 font-semibold">Bestaande verrekening vastleggen</h2>{cents(agreement.paidEur) < amounts.charge ? <p className="text-sm text-muted">Registreer eerst de volledige betaling van het pakket bij ‘Afspraak aanpassen’.</p> : <RedemptionForm key={entries.length + used} contactId={id} agreementId={agreement.id} />}</Card>}
    <Card className="mb-5"><CardHeader><CardTitle>Verrekenhistorie</CardTitle></CardHeader><div className="space-y-4 px-5 pb-5">{entries.length === 0 ? <p className="text-sm text-muted">Nog geen verrekeningen geregistreerd.</p> : entries.map(({ entry, name }) => <div key={entry.id} className="border-t pt-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{entry.reference}</p><p className="text-xs text-muted">{entry.bookedOn} · {name ?? "medewerker"} · orderwaarde {formatEUR(entry.orderEur)}</p></div><span className={`font-semibold tabular-nums ${entry.voidedAt ? "text-muted line-through" : ""}`}>{formatEUR(entry.amountEur)}</span></div>{entry.note && <p className="mt-2 text-sm">{entry.note}</p>}{entry.voidedAt ? <p className="mt-2 text-xs text-muted">Teruggedraaid: {entry.voidReason}</p> : canWrite && agreement ? <VoidForm contactId={id} agreementId={agreement.id} entryId={entry.id} /> : null}</div>)}</div></Card>
  </>;
}
