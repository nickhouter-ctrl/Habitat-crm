import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ matches: vi.fn(), inserted: [] as { table: unknown; values: unknown }[], updates: [] as { table: unknown; values: unknown; filter: SQL }[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: m.matches }) }) }),
  insert: (table: unknown) => ({ values: (values: unknown) => { m.inserted.push({ table, values }); return { onConflictDoNothing: async () => [] }; } }),
  update: (table: unknown) => ({ set: (values: unknown) => ({ where: async (filter: SQL) => { m.updates.push({ table, values, filter }); } }) }),
} }));
import { contacts, partnerMessages, partnerProfiles } from '@/lib/db/schema';
import { markPartnerContacted, recordPartnerReply } from '@/lib/partner-correspondence';
const mail = { toEmail: ' ANA@example.com ', mailboxUser: 'hi@habitat-one.com', subject: 'Re: showroom', body: 'Our actual answer', html: '<p>Our actual answer</p>', messageId: 'smtp-id', referencesHeader: 'incoming-id', authorId: 'author', attachments: [{ name: 'technical-data.pdf', size: 100 }] };
beforeEach(() => { m.inserted = []; m.updates = []; m.matches.mockReset().mockResolvedValue([{ id: 'contact' }]); vi.stubEnv('GMAIL_MARKETING_USER', 'teresa@example.com'); });
afterEach(() => vi.unstubAllEnvs());
describe('echte correspondentie in opvolging', () => {
  it('bewaart het volledige verzonden antwoord, bijlagen en identiteit direct in het dossier', async () => {
    await recordPartnerReply(mail);
    expect(m.inserted.find(r => r.table === partnerMessages)?.values).toEqual(expect.objectContaining({ ...mail, contactId: 'contact', source: 'inbox', status: 'sent', personal: true, sentAt: expect.any(Date) }));
    expect(m.updates.find(r => r.table === contacts)).toBeDefined();
    const profile = m.updates.find(r => r.table === partnerProfiles)!;
    expect(profile.values).toEqual(expect.objectContaining({ stage: 'contacted' }));
    expect(new PgDialect({ casing: 'snake_case' }).sqlToQuery(profile.filter).params).toEqual(['contact', 'new']);
  });
  it('wijzigt geen beroep, interesse, bestaande afspraken of gevorderde dossierfase', async () => {
    await markPartnerContacted('contact', new Date(), mail.mailboxUser);
    expect(m.updates.find(r => r.table === contacts)?.values).not.toHaveProperty('type');
    expect(m.updates.find(r => r.table === partnerProfiles)?.values).not.toHaveProperty('interest');
    expect(m.updates.find(r => r.table === partnerProfiles)?.values).not.toHaveProperty('nextAction');
  });
  it('koppelt een gedeeld of onbekend klantadres niet aan een willekeurige klant', async () => {
    m.matches.mockResolvedValue([{ id: 'one' }, { id: 'two' }]); await recordPartnerReply(mail);
    expect(m.inserted).toHaveLength(0); expect(m.updates).toHaveLength(0);
    m.matches.mockResolvedValue([]); await recordPartnerReply(mail); expect(m.inserted).toHaveLength(0);
  });
  it('bewaart privécorrespondentie in het afgeschermde postvak zonder gedeelde fase te wijzigen', async () => {
    await recordPartnerReply({ ...mail, mailboxUser: 'teresa@example.com' });
    expect(m.inserted.find(r => r.table === partnerMessages)?.values).toEqual(expect.objectContaining({ mailboxUser: 'teresa@example.com' }));
    expect(m.updates).toHaveLength(0);
  });
});
