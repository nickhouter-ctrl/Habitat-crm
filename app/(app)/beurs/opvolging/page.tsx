import Link from 'next/link';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts, companies, partnerProfiles, partnerMessages, quoteRequests, emailInbox, users } from '@/lib/db/schema';
import { requireModuleRead } from '@/lib/auth/guards';
import { mailZichtbaarVoor } from '@/lib/mail-visibility';
import { partnerMailVisible } from '@/lib/partner-context';
import { conversationState, INTEREST, STAGES } from '@/lib/partners';
import { followupSources } from '@/lib/followup-source';
import { hasResellerInterest, recommendedFollowupMail } from '@/lib/followup-mail';
import { PageHeader, Card, CardContent, StatTile, LinkButton, Badge } from '@/components/ui';
import { SyncButton } from './forms';

export const metadata = { title: 'Opvolging' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: {
  searchParams: Promise<{ q?: string; filter?: string; bron?: string; groep?: string }>;
}) {
  const access = await requireModuleRead('aanvragen');
  const s = await searchParams;
  const rows = await db.select({ contact: contacts, company: companies.name, profile: partnerProfiles, owner: users.name })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(partnerProfiles, eq(partnerProfiles.contactId, contacts.id))
    .leftJoin(users, eq(users.id, partnerProfiles.ownerId))
    .where(or(
      isNotNull(partnerProfiles.contactId),
      inArray(contacts.type, ['lead', 'reseller']),
      sql`coalesce(${contacts.tags}, '{}'::text[]) @> array['rol:wederverkoper']`,
      inArray(contacts.id, db.select({ id: quoteRequests.contactId }).from(quoteRequests)),
    )).orderBy(contacts.name);

  const canMail = access.magModule('inbox');
  const [sources, [sent, incoming]] = await Promise.all([
    db.select({ contactId: quoteRequests.contactId, source: quoteRequests.source }).from(quoteRequests)
      .where(inArray(quoteRequests.contactId, rows.map(r => r.contact.id))),
    canMail ? Promise.all([
      db.select({ contactId: partnerMessages.contactId, at: sql<Date>`max(${partnerMessages.sentAt})` })
        .from(partnerMessages).where(and(eq(partnerMessages.status, 'sent'), eq(partnerMessages.personal, true), partnerMailVisible(access.email)))
        .groupBy(partnerMessages.contactId),
      db.select({ email: emailInbox.fromEmail, at: sql<Date>`max(${emailInbox.receivedAt})` })
        .from(emailInbox).where(mailZichtbaarVoor(access.email)).groupBy(emailInbox.fromEmail),
    ]) : Promise.resolve([[], []] as const),
  ]);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const data = rows.map(r => {
    const out = sent.find(m => m.contactId === r.contact.id)?.at;
    const inc = incoming.filter(m => m.email?.toLowerCase() === r.contact.email?.toLowerCase())
      .map(m => m.at).filter(Boolean).sort((a, b) => +new Date(b) - +new Date(a))[0];
    return {
      ...r, out,
      origins: followupSources(r.contact.source, sources.filter(m => m.contactId === r.contact.id).map(m => m.source)),
      state: conversationState(inc ? new Date(inc) : null, out ? new Date(out) : null),
      due: !!r.profile?.nextActionOn && r.profile.nextActionOn <= today,
      interested: hasResellerInterest(r.contact,r.profile),
    };
  });
  const visible = data.filter(r =>
    (!s.q || `${r.contact.name} ${r.company ?? ''} ${r.contact.email ?? ''}`.toLowerCase().includes(s.q.toLowerCase())) &&
    (!s.bron || r.origins.some(o => o.key === s.bron)) &&
    (!s.groep || s.groep==='reseller' && r.interested || s.groep==='professional' && !r.interested) &&
    (!s.filter || s.filter === 'due' && r.due || s.filter === 'reply' && r.state === 'Antwoord nodig' ||
      s.filter === 'interested' && r.interested || s.filter === 'new' && !r.out || s.filter === 'active' && r.profile?.active),
  );
  const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-foreground';

  return <div className="space-y-6">
    <PageHeader title="Opvolging" subtitle="Mails, afspraken en de volgende stap voor iedere klant."
      actions={<>
        <LinkButton href="/contacts" variant="secondary">Contact kiezen</LinkButton>
        {access.magModule('producten') && <LinkButton href="/wederverkopers">Verkooppunten</LinkButton>}
      </>} />
    <div className="grid gap-3 sm:grid-cols-4">
      <Link href="/opvolging"><StatTile label="In opvolging" value={data.length} /></Link>
      <Link href="/opvolging?filter=reply"><StatTile label="Antwoord nodig" value={data.filter(r => r.state === 'Antwoord nodig').length} /></Link>
      <Link href="/opvolging?filter=due"><StatTile label="Nu opvolgen" value={data.filter(r => r.due).length} /></Link>
      <Link href="/opvolging?filter=interested"><StatTile label="Verkooppuntinteresse" value={data.filter(r => r.interested).length} /></Link>
    </div>
    <Card><CardContent>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <form action="/opvolging" className="flex flex-wrap gap-2">
          <input aria-label="Zoek bedrijf of contact" name="q" defaultValue={s.q} placeholder="Zoek bedrijf of contact…" className={input} />
          <select aria-label="Filter" name="filter" defaultValue={s.filter ?? ''} className={input}>
            {Object.entries({ '': 'Iedereen', reply: 'Antwoord nodig', due: 'Nu opvolgen', new: 'Nog geen persoonlijke mail', interested: 'Verkooppuntinteresse', active: 'Officiële verkooppunten' })
              .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Herkomst" name="bron" defaultValue={s.bron ?? ''} className={input}>
            <option value="">Alle herkomsten</option><option value="beurs">Beurs</option><option value="website">Website</option>
            <option value="other">Overige kanalen</option><option value="unknown">Niet vastgelegd</option>
          </select>
          <select aria-label="Mailgroep" name="groep" defaultValue={s.groep ?? ''} className={input}>
            <option value="">Alle mailgroepen</option><option value="professional">Architecten, bouwbedrijven & overige klanten</option><option value="reseller">Verkooppunten & geïnteresseerden</option>
          </select>
          <button className="rounded-lg border px-4 py-2 text-sm">Filteren</button>
        </form>
        {canMail && access.heeftCap('schrijven') && <SyncButton />}
      </div>
      <p className="mt-3 text-xs text-muted">Open een klant voor het passende mailvoorstel. Verkooppuntinteresse kun je apart van het beroep vastleggen. Automatische informatie- en filmmails tellen niet als persoonlijke opvolging.</p>
    </CardContent></Card>
    <Card><div className="border-b px-5 py-3 text-xs text-muted">{visible.length} van {data.length} contacten</div><div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="border-b bg-background text-foreground"><tr>
        {['Contact / bedrijf', 'Interesse & fase', 'Gesprek', 'Volgende stap'].map(t => <th className="px-5 py-3 font-medium" key={t}>{t}</th>)}
      </tr></thead>
      <tbody>{visible.map(r => <tr className="border-b last:border-0 hover:bg-background/60" key={r.contact.id}>
        <td className="px-5 py-4">
          <Link className="font-semibold underline-offset-4 hover:underline" href={`/opvolging/${r.contact.id}`}>{r.contact.name}</Link>
          <p className="text-muted">{r.company ?? r.contact.email}</p>
          <p className="mt-1 text-xs text-muted">{r.origins.map(o => o.label).join(' · ')}</p>
          <p className="mt-1 text-xs">Mailvoorstel: {({reseller:'verkooppunt',professional:'zakelijke klant',custom:'eigen mail'})[recommendedFollowupMail(r.contact,r.profile)]}</p>
        </td>
        <td className="px-5 py-4">
          {INTEREST[(r.profile?.interest ?? (r.interested ? 'interested' : 'unknown')) as keyof typeof INTEREST]}
          <p className="text-muted">{STAGES[(r.profile?.stage ?? 'new') as keyof typeof STAGES]}</p>
        </td>
        <td className="px-5 py-4">
          {canMail ? <Badge className="whitespace-nowrap" tone={r.state === 'Antwoord nodig' ? 'warning' : 'neutral'}>{r.state}</Badge> : '—'}
          {r.out && <p className="mt-1 text-xs text-muted">Gemaild {new Date(r.out).toLocaleDateString('nl-NL')}</p>}
        </td>
        <td className="px-5 py-4">
          <p className={r.due ? 'font-medium text-warning' : ''}>{r.profile?.nextAction ?? 'Nog bepalen'}</p>
          {r.profile?.nextActionOn && <p className="text-xs text-muted">{new Date(`${r.profile.nextActionOn}T12:00:00Z`).toLocaleDateString('nl-NL')}</p>}
          {r.owner && <p className="text-xs text-muted">{r.owner}</p>}
        </td>
      </tr>)}</tbody>
    </table>{!visible.length && <p className="p-8 text-muted">Geen contacten bij dit filter.</p>}</div></Card>
  </div>;
}
