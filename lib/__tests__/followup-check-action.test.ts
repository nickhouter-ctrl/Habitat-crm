import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
const m = vi.hoisted(() => ({ guard: vi.fn(), transaction: vi.fn(), select: vi.fn(), lock: vi.fn(), insert: vi.fn(), set: vi.fn(), update: vi.fn(), filters: [] as SQL[] }));
vi.mock('@/lib/i18n/server', async () => ({ tekst: async () => (await import('@/lib/i18n')).maakT('nl') }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireModule: m.guard }));
vi.mock('@/lib/db', () => ({ db: { transaction: m.transaction } }));
vi.mock('@/lib/partner-context', () => ({ partnerContext: vi.fn(), partnerMailVisible: vi.fn() }));
vi.mock('@/lib/partner-mail-sync', () => ({ syncPartnerSent: vi.fn() }));
vi.mock('@/lib/ai-reply', () => ({ genereerMailAntwoord: vi.fn() }));
vi.mock('@/lib/gmail', () => ({ getMailAccounts: vi.fn() }));
vi.mock('@/lib/email', () => ({ persoonlijkeMail: vi.fn(), sendEmail: vi.fn() }));
vi.mock('@/lib/sent-email', () => ({ recordSentEmail: vi.fn() }));
vi.mock('@/lib/followup-mail-attachments', () => ({ followupAttachments: vi.fn() }));
import { activities } from '@/lib/db/schema';
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from '@/lib/followup-checklist';
import { setFollowupCompleted } from '../../app/(app)/beurs/opvolging/actions';

const contactId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const authorId = '00000000-0000-4000-8000-000000000003';
function form(completed = true, expectedEventId = '') {
  const fd = new FormData(); fd.set('contactId', contactId); fd.set('expectedEventId', expectedEventId);
  if (completed) fd.set('completed', 'on');
  return fd;
}
beforeEach(() => {
  vi.resetAllMocks(); m.filters=[]; m.guard.mockResolvedValue({ id: authorId });
  m.lock.mockImplementation(() => m.select());
  m.transaction.mockImplementation(async run => run({
    select: () => ({ from: () => ({ where: () => ({ for: m.lock, orderBy: () => ({ limit: m.select }) }) }) }),
    insert: () => ({ values: m.insert }),
    update: (table: unknown) => { m.update(table); return { set: (values: unknown) => { m.set(values); return { where: async (filter: SQL) => { m.filters.push(filter); return new PgDialect({ casing: 'snake_case' }).sqlToQuery(filter); } }; } }; },
  }));
});
describe('opvolgstatus bewaren', () => {
  it('controleert schrijfrechten vóór enige databasebewerking', async () => {
    m.guard.mockRejectedValue(new Error('Geen toegang'));
    await expect(setFollowupCompleted({}, form())).rejects.toThrow('Geen toegang');
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('weigert ongeldige invoer vóór de transactie', async () => {
    const fd = form(); fd.set('contactId', '../../other');
    expect((await setFollowupCompleted({}, fd)).error).toBeTruthy();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('legt afhandeling en de medewerker vast zonder beroep of fase te veranderen', async () => {
    m.select.mockResolvedValueOnce([{ id: contactId }]).mockResolvedValueOnce([]);
    expect((await setFollowupCompleted({}, form())).success).toBeTruthy();
    expect(m.guard).toHaveBeenCalledWith('aanvragen'); expect(m.lock).toHaveBeenCalledWith('update');
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ contactId, authorId, type: 'note', subject: FOLLOWUP_DONE, createdAt: expect.any(Date) }));
    expect(m.update).toHaveBeenCalledTimes(1); expect(m.update).toHaveBeenCalledWith(activities);
    expect(m.set).toHaveBeenCalledWith({ completedAt: expect.any(Date), updatedAt: expect.any(Date) });
    const filter=new PgDialect({casing:'snake_case'}).sqlToQuery(m.filters[0]);
    expect(filter.params).toContain(contactId); expect(filter.params).toContain('task');
    expect(filter.sql).toContain("at time zone 'Europe/Madrid'");expect(filter.sql).toContain('::date <=');
    expect(filter.sql).toContain('"completed_at" is null');
  });
  it('kan een vinkje weer uitzetten en heropent de bijbehorende taak', async () => {
    const at = new Date('2026-10-02T09:00:00Z');
    m.select.mockResolvedValueOnce([{ id: contactId }]).mockResolvedValueOnce([{ id: eventId, subject: FOLLOWUP_DONE, createdAt: at }]);
    expect((await setFollowupCompleted({}, form(false, eventId))).success).toBeTruthy();
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ subject: FOLLOWUP_REOPENED }));
    expect(m.set).toHaveBeenCalledWith({ completedAt: null, updatedAt: expect.any(Date) });
    const filter=new PgDialect({casing:'snake_case'}).sqlToQuery(m.filters[0]);
    expect(filter.params).toContain(contactId);expect(filter.sql).toContain('"completed_at" =');
  });
  it('overschrijft geen wijziging van een andere medewerker of dubbele klik', async () => {
    m.select.mockResolvedValueOnce([{ id: contactId }]).mockResolvedValueOnce([{ id: eventId }]);
    expect((await setFollowupCompleted({}, form())).error).toContain('inmiddels gewijzigd');
    expect(m.insert).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it('kan geen afhandeling opslaan voor een verdwenen contact', async () => {
    m.select.mockResolvedValueOnce([]);
    expect((await setFollowupCompleted({}, form())).error).toContain('Contact niet gevonden');
    expect(m.insert).not.toHaveBeenCalled();
  });
});
