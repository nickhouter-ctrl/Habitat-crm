/** Opt-in integratietest: alle testgegevens blijven in een teruggedraaide transactie. */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ current: null as unknown, guard: vi.fn() }));
vi.mock('@/lib/i18n/server', async () => ({ tekst: async () => (await import('@/lib/i18n')).maakT('nl') }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireModule: m.guard }));
vi.mock('@/lib/db', async () => {
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { ...real, db: new Proxy(real.db, { get(target, key) {
    const active = (m.current ?? target) as typeof real.db;
    const value = Reflect.get(active, key);
    return typeof value === 'function' ? value.bind(active) : value;
  } }) };
});
vi.mock('@/lib/partner-context', () => ({ partnerContext: vi.fn(), partnerMailVisible: vi.fn() }));
vi.mock('@/lib/partner-mail-sync', () => ({ syncPartnerSent: vi.fn() }));
vi.mock('@/lib/ai-reply', () => ({ genereerMailAntwoord: vi.fn() }));
vi.mock('@/lib/gmail', () => ({ getMailAccounts: vi.fn() }));
vi.mock('@/lib/email', () => ({ persoonlijkeMail: vi.fn(), sendEmail: vi.fn() }));
vi.mock('@/lib/sent-email', () => ({ recordSentEmail: vi.fn() }));
vi.mock('@/lib/followup-mail-attachments', () => ({ followupAttachments: vi.fn() }));
import { activities, contacts, partnerProfiles, users } from '@/lib/db/schema';
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED } from '@/lib/followup-checklist';
import { latestFollowupCompletions } from '@/lib/followup-checklist-data';
import { markPartnerContacted } from '@/lib/partner-correspondence';
import { saveProfile, setFollowupCompleted } from '../../app/(app)/beurs/opvolging/actions';

const enabled = process.env.FOLLOWUP_ROLLBACK_DB_TEST === '1';
afterAll(async () => {
  if (enabled) (await vi.importActual<typeof import('@/lib/db')>('@/lib/db')).pgClient.end({ timeout: 1 });
});

it.skipIf(!enabled)('bewaart, heropent en auditeert afvinken zonder andere taken of klantgegevens te veranderen', async () => {
  const real = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  const contactId = randomUUID(), otherId = randomUUID(), authorId = randomUUID();
  const rollback = new Error('ROLLBACK_FOLLOWUP_TEST');
  const form = (completed: boolean, eventId = '') => {
    const fd = new FormData(); fd.set('contactId', contactId); fd.set('expectedEventId', eventId);
    if (completed) fd.set('completed', 'on'); return fd;
  };
  m.guard.mockResolvedValue({ id: authorId });
  try {
    await real.db.transaction(async tx => {
      m.current = tx;
      await tx.insert(users).values({ id: authorId, name: 'Rollback test', email: `${authorId}@example.invalid` });
      await tx.insert(contacts).values([{ id: contactId, name: 'Rollback test', type: 'lead', source: 'beurs:test' }, { id: otherId, name: 'Rollback other' }]);
      const tasks = await tx.insert(activities).values([
        { contactId, type: 'task', subject: 'Opvolging', dueAt: new Date('2020-01-01T12:00:00Z') },
        { contactId, type: 'task', subject: 'Beursopvolging', dueAt: new Date('2100-01-01T12:00:00Z') },
        { contactId, type: 'task', subject: 'Andere taak' },
        { contactId: otherId, type: 'task', subject: 'Opvolging' },
      ]).returning();
      expect((await setFollowupCompleted({}, form(true))).success).toBeTruthy();
      const [done] = await latestFollowupCompletions([contactId]);
      expect(done.subject).toBe(FOLLOWUP_DONE);
      const saved = await tx.select().from(activities).where(inArray(activities.id, tasks.map(t => t.id)));
      expect(saved.find(t => t.id === tasks[0].id)?.completedAt?.toISOString()).toBe(done.createdAt.toISOString());
      expect(saved.filter(t => t.id !== tasks[0].id).every(t => t.completedAt === null)).toBe(true);
      expect((await setFollowupCompleted({}, form(true))).error).toContain('inmiddels gewijzigd');
      expect((await setFollowupCompleted({}, form(false, done.id))).success).toBeTruthy();
      const [reopened] = await latestFollowupCompletions([contactId]);
      expect(reopened.subject).toBe(FOLLOWUP_REOPENED);
      expect((await tx.select().from(activities).where(eq(activities.id, tasks[0].id)))[0].completedAt).toBeNull();
      expect((await setFollowupCompleted({}, form(true, reopened.id))).success).toBeTruthy();
      const profile = new FormData();
      for (const [key, value] of Object.entries({ contactId, version: '0', interest: 'interested', stage: 'discussion', language: 'en-es', ownerId: authorId, nextAction: 'Nieuwe afspraak plannen', nextActionOn: '2100-01-02', notes: '' })) profile.set(key, value);
      expect((await saveProfile({}, profile)).success).toBeTruthy();
      expect((await latestFollowupCompletions([contactId]))[0].subject).toBe(FOLLOWUP_REOPENED);
      expect((await tx.select().from(contacts).where(eq(contacts.id, contactId)))[0].type).toBe('lead');
      expect((await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId, contactId)))[0].interest).toBe('interested');
      const history = await tx.select().from(activities).where(and(eq(activities.contactId, contactId), inArray(activities.subject, [FOLLOWUP_DONE, FOLLOWUP_REOPENED])));
      expect(history).toHaveLength(4);
      expect(history.every(event => event.authorId === authorId)).toBe(true);
      // A raw Date in the GREATEST SQL parameter failed only against the real
      // postgres-js driver. Exercise that boundary and out-of-order replies.
      const newestReply = new Date('2026-10-02T10:00:00Z');
      await markPartnerContacted(contactId, newestReply, 'rollback@example.invalid');
      await markPartnerContacted(contactId, new Date('2020-01-01T10:00:00Z'), 'rollback@example.invalid');
      expect((await tx.select().from(contacts).where(eq(contacts.id, contactId)))[0].lastContactedAt?.toISOString()).toBe(newestReply.toISOString());
      expect((await tx.select().from(partnerProfiles).where(eq(partnerProfiles.contactId, contactId)))[0].stage).toBe('discussion');
      throw rollback; // Onvoorwaardelijk terugdraaien, ook wanneer alle checks slagen.
    });
    throw new Error('De integratietransactie is onverwacht vastgelegd');
  } catch (error) {
    if (error !== rollback) throw error;
  } finally { m.current = null; }
  expect(await real.db.select().from(contacts).where(inArray(contacts.id, [contactId, otherId]))).toHaveLength(0);
  expect(await real.db.select().from(users).where(eq(users.id, authorId))).toHaveLength(0);
}, 30000);
