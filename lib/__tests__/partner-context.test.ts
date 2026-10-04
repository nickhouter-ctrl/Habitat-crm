import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';

const m = vi.hoisted(() => ({ results: [] as unknown[][], queries: [] as { table: unknown; where?: unknown; limit?: number }[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: (table: unknown) => {
  const query: { table: unknown; where?: unknown; limit?: number } = { table };
  m.queries.push(query);
  const builder = {
    leftJoin: () => builder,
    where: (filter: unknown) => { query.where = filter; return builder; },
    orderBy: () => builder,
    limit: (limit: number) => { query.limit = limit; return Promise.resolve(m.results.shift() ?? []); },
  };
  return builder;
} }) } }));

import { appointments, emailInbox } from '@/lib/db/schema';
import { PARTNER_DIRECTION } from '@/lib/partners';
import { partnerContext } from '@/lib/partner-context';

const previousMailbox = process.env.GMAIL_MARKETING_USER;
beforeEach(() => {
  m.results = []; m.queries = [];
  process.env.GMAIL_MARKETING_USER = 'marketing@example.com';
});
afterEach(() => {
  if (previousMailbox === undefined) delete process.env.GMAIL_MARKETING_USER;
  else process.env.GMAIL_MARKETING_USER = previousMailbox;
});

describe('persoonlijke mailcontext met zichtbaarheidsgrenzen', () => {
  it('gebruikt voor eigen mail de vastgelegde klantvraag en afspraak op locatie zonder standaard panelenverkoop',async()=>{
    m.results=[[{contact:{id:'00000000-0000-4000-8000-000000000001',name:'Ana',type:'customer',notes:'Afspraak bij klant in Bloemendaal'},profile:{nextAction:'Afspraak plannen',nextActionOn:'2026-10-12'}}],[],[],[],[{title:'Bij klant',startsAt:new Date('2026-10-12T10:00:00Z'),location:'Bloemendaal',status:'scheduled'}]];
    const context=await partnerContext('ana@example.com','nick@example.com',{contactId:'00000000-0000-4000-8000-000000000001',includePartnerRules:false});
    expect(context).not.toContain('Habitat One levert Flexible Stone panelen');
    const data=JSON.parse(context.split('CRM-brongegevens: ')[1]);expect(data.afspraken[0].location).toBe('Bloemendaal');expect(data.volgendeOpvolgdatum).toBe('2026-10-12');
    expect(m.queries.find(q=>q.table===appointments)?.limit).toBe(5);
  });
  it('haalt reacties alleen van de klant en uit toegestane postvakken op', async () => {
    m.results = [[{ contact: { id: 'contact-1', name: 'Ana', type: 'architect', tags: ['wil:stalen'] }, profile: null }], [], [], [{ subject: 'Ons project', body: 'x'.repeat(3500), receivedAt: new Date('2026-10-01') }]];
    const context = await partnerContext(' ANA@example.com ', 'nick@example.com');
    const incoming = m.queries.find(q => q.table === emailInbox)!;
    const query = new PgDialect({ casing: 'snake_case' }).sqlToQuery(incoming.where as SQL);
    expect(query.sql).toContain('"from_email"');
    expect(query.sql).toContain('"mailbox_user" is distinct from');
    expect(query.params).toEqual(['ana@example.com', 'marketing@example.com']);
    expect(incoming.limit).toBe(3);
    const data = JSON.parse(context.split('CRM-brongegevens: ')[1]);
    expect(data.ontvangen[0].subject).toBe('Ons project');
    expect(data.ontvangen[0].body).toHaveLength(3000);
    expect(data.tags).toEqual(['wil:stalen']);
  });

  it('raadpleegt geen correspondentie bij meerdere contacten met hetzelfde e-mailadres', async () => {
    m.results = [[{ contact: { id: 'one' } }, { contact: { id: 'two' } }]];
    expect(await partnerContext('shared@example.com', 'nick@example.com')).toBe(PARTNER_DIRECTION);
    expect(m.queries).toHaveLength(1);
  });

  it('raadpleegt geen correspondentie zonder e-mailadres', async () => {
    expect(await partnerContext(null, 'nick@example.com')).toBe(PARTNER_DIRECTION);
    expect(m.queries).toHaveLength(0);
  });
});
