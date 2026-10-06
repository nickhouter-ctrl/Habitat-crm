import { tekst as uiTranslation } from '@/lib/i18n/server';
import { tekst, datumTaal } from '@/lib/i18n/server';
import Link from 'next/link';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts, companies, partnerProfiles, partnerMessages, quoteRequests, emailInbox, users } from '@/lib/db/schema';
import { requireModuleRead } from '@/lib/auth/guards';
import { geenInkoopmail, mailZichtbaarVoor } from '@/lib/mail-visibility';
import { partnerMailVisible } from '@/lib/partner-context';
import { conversationState } from '@/lib/partners';
import { followupSources } from '@/lib/followup-source';
import { hasResellerInterest } from '@/lib/followup-mail';
import { FOLLOWUP_SORTS, followupCompleted, laatsteReactie, sortFollowup, type FollowupSort } from '@/lib/followup-checklist';
import { latestFollowupCompletions } from '@/lib/followup-checklist-data';
import { PageHeader, Card, CardContent, LinkButton, Badge } from '@/components/ui';
import { ActionDialog } from '@/components/action-dialog';
import { SyncButton } from './forms';
import { FollowupCheck } from './check';
import { salesMailFilter } from '@/lib/auth/sales-scope';
import { followupEligible } from '@/lib/followup-selection';
import { FollowupExclude } from './exclude';
import { FollowupLive } from './live';

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Opvolging") };
}
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {

 const t=await tekst(); const dateLocale=await datumTaal();
  const access = await requireModuleRead('klantopvolging');
  const params = await searchParams;
  const param = (key: string) => typeof params[key] === 'string' ? params[key] : '';
  const q = param('q').trim().slice(0, 200);
  const filter = ['open','all','completed','reply','due','new','interested','active'].includes(param('filter')) ? param('filter') : 'open';
  const bron = ['beurs','website','other','unknown'].includes(param('bron')) ? param('bron') : '';
  const groep = ['reseller','professional'].includes(param('groep')) ? param('groep') : '';
  const sort = Object.hasOwn(FOLLOWUP_SORTS, param('sort')) ? param('sort') as FollowupSort : 'priority';
  const direction = ['asc','desc'].includes(param('direction')) ? param('direction') : sort === 'last' ? 'desc' : 'asc';
  const href = (changes: Record<string, string>) => {
    const query = new URLSearchParams({ q, filter, bron, groep, sort, direction, ...changes });
    for (const [key, value] of [...query]) if (!value) query.delete(key);
    return `/opvolging?${query}`;
  };
  const rows = await db.select({ contact: contacts, company: companies.name, profile: partnerProfiles, owner: users.name })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(partnerProfiles, eq(partnerProfiles.contactId, contacts.id))
    .leftJoin(users, eq(users.id, partnerProfiles.ownerId))
.where(followupEligible).orderBy(contacts.name);

  const canMail = access.magModule('inbox') || access.rol==='sales';
  const [sources, completions, [sent, incoming]] = await Promise.all([
    db.select({ contactId: quoteRequests.contactId, source: quoteRequests.source }).from(quoteRequests)
      .where(inArray(quoteRequests.contactId, rows.map(r => r.contact.id))),
    latestFollowupCompletions(rows.map(r => r.contact.id)),
    canMail ? Promise.all([
      db.select({ contactId: partnerMessages.contactId, at: sql<Date>`max(${partnerMessages.sentAt})` })
        .from(partnerMessages).where(and(eq(partnerMessages.status, 'sent'), eq(partnerMessages.personal, true), partnerMailVisible(access.email,access.rol,access.id)))
        .groupBy(partnerMessages.contactId),
      // Niet alleen wannéér er iets binnenkwam, maar ook wát: op de lijst wil je
      // zien waar de klant op reageerde zonder het dossier te openen.
      db.selectDistinctOn([emailInbox.fromEmail], {
        email: emailInbox.fromEmail,
        at: emailInbox.receivedAt,
        subject: emailInbox.subject,
        tekst: sql<string | null>`left(regexp_replace(coalesce(${emailInbox.bodyText}, ''), '\\s+', ' ', 'g'), 200)`,
      }).from(emailInbox).where(and(mailZichtbaarVoor(access.email), geenInkoopmail(),salesMailFilter(access.rol,access.email)))
        .orderBy(emailInbox.fromEmail, desc(emailInbox.receivedAt)),
    ]) : Promise.resolve([[], []] as const),
  ]);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const data = rows.map(r => {
    const out = sent.find(m => m.contactId === r.contact.id)?.at;
    const reactie = laatsteReactie(r.contact.email, incoming);
    const inc = reactie?.at ?? null;
    const completion = completions.find(e => e.contactId === r.contact.id);
    const completed = followupCompleted(completion, inc, r.profile?.nextActionOn, today);
    return {
      ...r, out, completion, completed, reactie,
      origins: followupSources(r.contact.source, sources.filter(m => m.contactId === r.contact.id).map(m => m.source)),
      state: conversationState(inc, out ? new Date(out) : null),
      due: !completed && !!r.profile?.nextActionOn && r.profile.nextActionOn <= today,
      interested: hasResellerInterest(r.contact,r.profile),
    };
  });
  const scoped = data.filter(r =>
    (!q || `${r.contact.name} ${r.company ?? ''} ${r.contact.email ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!bron || r.origins.some(o => o.key === bron)) &&
    (!groep || groep==='reseller' && r.interested || groep==='professional' && !r.interested),
  );
  const visible = sortFollowup(scoped.filter(r =>
    filter === 'all' || filter === 'open' && !r.completed && (r.state!=='Wachten op klant'||!!r.profile?.nextAction) || filter === 'completed' && r.completed ||
    filter === 'due' && r.due || filter === 'reply' && !r.completed && r.state === 'Antwoord nodig' ||
    filter === 'interested' && r.interested || filter === 'new' && !r.completed && !r.out || filter === 'active' && r.profile?.active,
  ), sort, direction === 'desc');
  const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-foreground';

  return <div className="space-y-6">
    <FollowupLive />
    <PageHeader title={t("Opvolging")} subtitle={t("Concrete aanvragen, open acties en klantreacties die opvolging nodig hebben.")}
      actions={<>
        <LinkButton href="/contacts" variant="secondary">{t("Contact kiezen")}</LinkButton>
        {access.magModule('verkooppunten') && <LinkButton href="/wederverkopers">{t("Verkooppunten")}</LinkButton>}
      </>} />
    <nav aria-label={t("Opvolgstatus")} className="flex gap-1 overflow-x-auto border-b">
      {([
        ['open','Nog opvolgen',scoped.filter(r=>!r.completed&&(r.state!=='Wachten op klant'||!!r.profile?.nextAction)).length],
        ['reply','Antwoord nodig',scoped.filter(r=>!r.completed&&r.state==='Antwoord nodig').length],
        ['due','Nu opvolgen',scoped.filter(r=>r.due).length],
        ['completed','Afgehandeld',scoped.filter(r=>r.completed).length],
      ] as const).map(([value,label,count])=><Link key={value} href={href({filter:value})} aria-current={filter===value?'page':undefined} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${filter===value?'border-accent bg-accent/5 text-accent':'border-transparent text-muted hover:bg-surface'}`}>{t(label)}<span className="rounded-full bg-background px-2 text-xs tabular-nums">{count}</span></Link>)}
    </nav>
    <Card><CardContent>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <form key={`${q}|${filter}|${bron}|${groep}|${sort}|${direction}`} action="/opvolging" className="flex w-full flex-wrap items-end gap-3">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">{t("Zoeken")} <input aria-label={t("Zoek bedrijf of contact")} name="q" defaultValue={q} maxLength={200} placeholder={t("Zoek bedrijf of contact…")} className={`${input} min-w-0 max-w-full`} />
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">{t("Opvolgstatus")} <select aria-label={t("Filter")} name="filter" defaultValue={filter} className={input}>
            {Object.entries({ open: 'Nog opvolgen', completed: 'Afgehandeld', all: 'Iedereen', reply: 'Antwoord nodig', due: 'Nu opvolgen', new: 'Nog geen persoonlijke mail', interested: 'Verkooppuntinteresse', active: 'Officiële verkooppunten' })
              .map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
          </select>
          </label>
          <ActionDialog title={t("Meer filters & sorteren")}><div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">{t("Herkomst")} <select aria-label={t("Herkomst")} name="bron" defaultValue={bron} className={input}>
            <option value="">{t("Alle herkomsten")}</option><option value="beurs">{t("Beurs")}</option><option value="website">{t("Website")}</option>
            <option value="other">{t("Overige kanalen")}</option><option value="unknown">{t("Niet vastgelegd")}</option>
          </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">{t("Mailgroep")} <select aria-label={t("Mailgroep")} name="groep" defaultValue={groep} className={`${input} min-w-0 max-w-full`}>
            <option value="">{t("Alle mailgroepen")}</option><option value="professional">{t("Architecten, bouwbedrijven & overige klanten")}</option><option value="reseller">{t("Verkooppunten & geïnteresseerden")}</option>
          </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">{t("Sorteren op")} <select aria-label={t("Sorteren op")} name="sort" defaultValue={sort} className={`${input} min-w-0 max-w-full`}>
            {Object.entries(FOLLOWUP_SORTS).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}
          </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">{t("Volgorde")} <select aria-label={t("Volgorde")} name="direction" defaultValue={direction} className={input}>
            <option value="asc">{t("Oplopend")}</option><option value="desc">{t("Aflopend")}</option>
          </select>
          </label>
          </div><button className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">{t("Toepassen")}</button></ActionDialog>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">{t("Toepassen")}</button>
        </form>
        {canMail && access.heeftCap('schrijven') && access.magModule('inbox') && <SyncButton />}
      </div>
      <div className="mt-3"><ActionDialog title={t("Zo werkt de opvolging")}><p className="text-sm text-muted">{t("Open een naam om persoonlijk te mailen of een afspraak te plannen. Vink af als deze opvolging klaar is. Je kunt de klant terugvinden bij Afgehandeld en het vinkje weer uitzetten. Een nieuwe reactie of volgende opvolgdatum brengt de klant terug.")}</p>
      <p className="mt-2 text-xs text-muted">{t("Na een bevestigde persoonlijke mail wordt de huidige opvolging automatisch afgevinkt. Gebruik ‘Uit werklijst halen’ voor contacten die geen opvolging nodig hebben.")}</p>
      <p className="mt-2 text-xs text-muted">{t('Gesprekken worden automatisch bijgewerkt.')}</p>
</ActionDialog></div>
    </CardContent></Card>
    <Card><div className="border-b px-5 py-3 text-sm text-muted">{visible.length} {t("van")} {scoped.length} {t("contacten")}{bron==='beurs'?t(" van de beurs"):''}</div><div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="border-b bg-background text-foreground"><tr>
        <th className="px-5 py-3 font-medium">{t("Afgehandeld")}</th>
        {['Bedrijf / contact', 'Gesprek', 'Volgende stap'].map(label => <th className="px-5 py-3 font-medium" key={label}>{t(label)}</th>)}
      </tr></thead>
      <tbody>{visible.map(r => <tr className="border-b last:border-0 hover:bg-background/60" key={r.contact.id}>
        <td className="px-5 py-4">{access.heeftCap('schrijven') ? <FollowupCheck key={`${r.completion?.id??'new'}:${r.completed}`} contactId={r.contact.id} name={r.contact.name} completed={r.completed} eventId={r.completion?.id??''}/> : r.completed?t("Ja"):t("Nee")}</td>
        <td className="px-5 py-4">
          {/* Bedrijf bovenaan, de persoon eronder: je belt een zaak, en zo staan
              twee mensen van hetzelfde bedrijf ook herkenbaar onder elkaar. */}
          <Link className="font-semibold underline-offset-4 hover:underline" href={`/opvolging/${r.contact.id}`}>{bedrijfEerst(r.company, r.contact.name).kop}</Link>
          <p className="text-muted">{bedrijfEerst(r.company, r.contact.name).onder ?? r.contact.email}</p>
          <p className="mt-1 text-xs text-muted">{r.origins.map(o => t(o.label)).join(' · ')}</p>
        {access.heeftCap('schrijven')&&<FollowupExclude id={r.contact.id}/>}</td>
        <td className="px-5 py-4">
          {canMail ? <Badge className="whitespace-nowrap" tone={r.state === 'Antwoord nodig' ? 'warning' : 'neutral'}>{t(r.state)}</Badge> : '—'}
          {r.out && <p className="mt-1 text-xs text-muted">{t("Gemaild")} {new Date(r.out).toLocaleDateString(dateLocale)}</p>}
          {/* Wát de klant terugschreef, zodat je op de lijst al ziet waar het
              over gaat en niet eerst het dossier hoeft te openen. */}
          {canMail && r.state === 'Antwoord nodig' && r.reactie && <div className="mt-2"><ActionDialog title={t("Antwoord bekijken")} trigger={t("Antwoord bekijken")} className="min-h-6 border-0 bg-transparent p-0 text-xs text-accent underline-offset-4 hover:bg-transparent hover:underline">
            <p className="text-xs font-medium">{t("Antwoord")} {new Date(r.reactie.at).toLocaleString(dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            {r.reactie.subject && <p className="mt-2 text-sm font-medium">{r.reactie.subject}</p>}
            {r.reactie.tekst?.trim() && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{r.reactie.tekst.replace(/\[cid:[^\]]*\]/g, '').trim()}</p>}
            <Link className="mt-4 inline-block text-sm text-accent underline" href={`/opvolging/${r.contact.id}`}>{t("Klantdossier")}</Link>
          </ActionDialog></div>}
        </td>
        <td className="px-5 py-4">
          <p className={r.due ? 'font-medium text-warning' : ''}>{r.profile?.nextAction ?? t("Nog bepalen")}</p>
          {r.profile?.nextActionOn && <p className="text-xs text-muted">{new Date(`${r.profile.nextActionOn}T12:00:00Z`).toLocaleDateString(dateLocale)}</p>}
          {r.owner && <p className="text-xs text-muted">{r.owner}</p>}
        </td>
      </tr>)}</tbody>
    </table>{!visible.length && <p className="p-8 text-muted">{t("Geen contacten bij dit filter.")}</p>}</div></Card>
  </div>;
}

/**
 * Wat bovenaan staat en wat eronder. Zonder bedrijf, of als het bedrijf
 * gewoon de naam van de persoon is ("Haelmilo S.L." / "Haelmilo S.L."), staat
 * de naam één keer bovenaan.
 */
function bedrijfEerst(bedrijf: string | null | undefined, naam: string): { kop: string; onder: string | null } {
  const b = bedrijf?.trim();
  const gelijk = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  if (!b || gelijk(b) === gelijk(naam)) return { kop: naam, onder: null };
  return { kop: b, onder: naam };
}
