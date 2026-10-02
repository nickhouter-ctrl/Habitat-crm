import { tekst } from '@/lib/i18n/server';
import { asc, eq, inArray, or, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Badge, Card, CardContent, LinkButton, PageHeader, StatTile, TBody, Table, Td, Th, THead, Tr } from '@/components/ui';
import { db } from '@/lib/db';
import { companies, consignments, contacts, partnerProfiles, products } from '@/lib/db/schema';
import { requireModuleRead } from '@/lib/auth/guards';
import { STAGES } from '@/lib/partners';
import { formatEUR } from '@/lib/utils';

export const metadata = { title: 'Verkooppunten' };

export default async function VerkooppuntenPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
 const t=await tekst();
  const access = await requireModuleRead('producten');
  const s = await searchParams;
  const [resellers, summaryRows] = await Promise.all([
    db.select({ contact: contacts, company: companies.name, profile: partnerProfiles }).from(contacts)
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .leftJoin(partnerProfiles, eq(partnerProfiles.contactId, contacts.id))
      .where(or(
        eq(contacts.type, 'reseller'),
        eq(partnerProfiles.active, true),
        inArray(partnerProfiles.interest, ['interested', 'candidate']),
        sql`coalesce(${contacts.tags}, '{}'::text[]) @> array['rol:wederverkoper'] and (${partnerProfiles.contactId} is null or ${partnerProfiles.interest} <> 'not_interested')`,
      )).orderBy(asc(contacts.name)),
    db.select({
      resellerId: consignments.resellerId,
      inStoreValue: sql<number>`coalesce(sum((${consignments.qtyPlaced} - ${consignments.qtySold}) * coalesce(${products.dealerPriceEur}, ${products.priceEur} * 0.75, ${consignments.dealerPriceEur}, 0)), 0)::float8`,
      soldValue: sql<number>`coalesce(sum(${consignments.qtySold} * coalesce(${products.dealerPriceEur}, ${products.priceEur} * 0.75, ${consignments.dealerPriceEur}, 0)), 0)::float8`,
    }).from(consignments).leftJoin(products, eq(consignments.productId, products.id)).groupBy(consignments.resellerId),
  ]);
  const byId = new Map(summaryRows.map(r => [r.resellerId, r]));
  const candidate = (r: typeof resellers[number]) => !r.profile?.active && r.profile?.stage !== 'stopped' && r.profile?.interest !== 'not_interested';
  const visible = resellers.filter(r =>
    (!s.q || `${r.contact.name} ${r.company ?? ''} ${r.contact.email ?? ''}`.toLowerCase().includes(s.q.toLowerCase())) &&
    (!s.status || s.status === 'active' && r.profile?.active || s.status === 'candidate' && candidate(r)),
  );
  const totals = resellers.reduce((sum, r) => {
    const stock = byId.get(r.contact.id);
    return { stock: sum.stock + Number(stock?.inStoreValue ?? 0), sales: sum.sales + Number(stock?.soldValue ?? 0) };
  }, { stock: 0, sales: 0 });

  return <div className="space-y-6">
    <PageHeader title={t("Verkooppunten")} subtitle={t("Van interesse naar een officiële samenwerking. Contract, presentatie en afname per klant.")}
      actions={access.magModule('aanvragen') && <LinkButton href="/opvolging">{t("Opvolging")}</LinkButton>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Link href="/wederverkopers?status=candidate"><StatTile label={t("Kandidaten")} value={resellers.filter(candidate).length} /></Link>
      <Link href="/wederverkopers?status=active"><StatTile label={t("Officieel")} value={resellers.filter(r => r.profile?.active).length} /></Link>
      <StatTile label={t("In winkels")} value={formatEUR(totals.stock)} hint={t("consignatie · ex. btw")} />
      <StatTile label={t("Omzet via dealers")} value={formatEUR(totals.sales)} hint={t("consignatie · ex. btw")} />
    </div>
    <Card><CardContent>
      <form action="/wederverkopers" className="flex flex-wrap gap-2">
        <input aria-label={t("Zoek verkooppunt")} name="q" defaultValue={s.q} placeholder={t("Zoek bedrijf of contact…")}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground" />
        <select aria-label={t("Verkooppuntstatus")} name="status" defaultValue={s.status ?? ''}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground">
          <option value="">{t("Alle verkooppunten")}</option><option value="candidate">{t("Kandidaten")}</option><option value="active">{t("Officieel")}</option>
        </select>
        <button className="rounded-lg border px-4 py-2 text-sm">{t("Filteren")}</button>
      </form>
      <p className="mt-3 text-xs text-muted">{t("Een architect of bouwbedrijf kan ook verkooppunt worden. Leg de interesse vast in het klantdossier.")}</p>
    </CardContent></Card>
    <Card>
      {visible.length ? <Table><THead><tr><Th>{t("Contact / bedrijf")}</Th><Th>{t("Status")}</Th><Th>{t("Plaats")}</Th><Th className="text-right">{t("Beheer")}</Th></tr></THead>
        <TBody>{visible.map(r => <Tr key={r.contact.id}>
          <Td>
            {access.magModule('aanvragen') ? <Link className="font-semibold hover:underline" href={`/opvolging/${r.contact.id}`}>{r.contact.name}</Link> : <span className="font-semibold">{r.contact.name}</span>}
            <p className="text-muted">{r.company ?? r.contact.email}</p>
          </Td>
          <Td>
            <Badge tone={r.profile?.active ? 'success' : 'neutral'}>{r.profile?.active ? t("Officieel verkooppunt") : r.profile?.stage === 'stopped' ? t("Gestopt") : r.profile?.interest === 'not_interested' ? t("Geen interesse") : t("Kandidaat")}</Badge>
            {!r.profile?.active && <p className="mt-1 text-xs text-muted">{t(STAGES[(r.profile?.stage ?? "new") as keyof typeof STAGES])}</p>}
          </Td>
          <Td>{r.profile?.publicCity ?? r.contact.city ?? t("Nog vastleggen")}</Td>
          <Td><div className="flex flex-wrap justify-end gap-3">
            <Link href={`/wederverkopers/${r.contact.id}/samenwerking`} className="font-medium text-accent hover:underline">{t("Samenwerking")}</Link>
            <Link href={`/wederverkopers/${r.contact.id}/presentatie`} className="text-muted hover:underline">{t("Presentatie")}</Link>
            <Link href={`/wederverkopers/${r.contact.id}`} className="text-muted hover:underline">{t("Voorraad")}</Link>
          </div></Td>
        </Tr>)}</TBody></Table> : <div className="space-y-3 p-8">
        <p className="font-medium">{t("Geen verkooppunten bij dit filter.")}</p>
        <p className="text-sm text-muted">{t("Open een klantdossier en kies ‘Wil verkooppunt worden’ bij de interesse.")}</p>
        {access.magModule('aanvragen') && <LinkButton href="/opvolging" variant="secondary">{t("Naar opvolging")}</LinkButton>}
      </div>}
    </Card>
  </div>;
}
