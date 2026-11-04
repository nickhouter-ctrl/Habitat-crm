import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), invalidate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', async () => ({ db: (await import('drizzle-orm/pg-proxy')).drizzle(mocks.query, { casing: 'snake_case' }) }));
vi.mock('@/lib/auth/guards', () => ({ requireModuleRead: mocks.auth, requireModule: mocks.auth }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.invalidate }));
vi.mock('@/lib/staff-notifications', () => ({ sendQueuedStaffNotification: vi.fn() }));
import { setTeamMessageDismissed } from '../../app/(app)/teamberichten/actions';
const id = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: userId });
  mocks.query.mockResolvedValue({ rows: [[id]] });
});
it.each(['inbox', 'sent'] as const)('checks off only the current user’s %s copy', async folder => {
  expect(await setTeamMessageDismissed({ id, folder, dismissed: true })).toEqual({});
  const [sql, params] = mocks.query.mock.calls[0];
  const role = folder === 'sent' ? 'sender' : 'recipient';
  expect(sql).toContain(`"${role}_dismissed_at" = $1`);
  expect(sql).toContain(`"staff_messages"."${role}_id" = $4`);
  expect(params.slice(-2)).toEqual([id, userId]);
  expect(params[0]).toMatch(/^\d{4}-/);
  expect(sql).not.toContain(role === 'sender' ? 'recipient_dismissed_at' : 'sender_dismissed_at');
  expect(sql).not.toContain('activities');
  expect(sql).not.toContain('read_at');
  expect(mocks.invalidate).toHaveBeenCalledWith('/', 'layout');
});
it('restores the personal copy without changing the read status', async () => {
  expect(await setTeamMessageDismissed({ id, folder: 'inbox', dismissed: false })).toEqual({});
  expect(mocks.query.mock.calls[0][1][0]).toBeNull();
  expect(mocks.query.mock.calls[0][0]).not.toContain('read_at');
});
it.each([{ id: 'bad', folder: 'inbox', dismissed: true }, { id, folder: 'other', dismissed: true }, { id, folder: 'inbox', dismissed: 'true' }])('rejects malformed requests before SQL', async input => {
  expect((await setTeamMessageDismissed(input)).error).toBeTruthy();
  expect(mocks.query).not.toHaveBeenCalled();
});
it('does not report success when ownership filtering finds no message', async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] });
  expect((await setTeamMessageDismissed({ id, folder: 'inbox', dismissed: true })).error).toBeTruthy();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
it('fails closed when module access is denied', async () => {
  mocks.auth.mockRejectedValueOnce(new Error('No access'));
  await expect(setTeamMessageDismissed({ id, folder: 'inbox', dismissed: true })).rejects.toThrow('No access');
  expect(mocks.query).not.toHaveBeenCalled();
});
it('returns a safe retry message on database failure', async () => {
  mocks.query.mockRejectedValueOnce(new Error('private database details'));
  const result = await setTeamMessageDismissed({ id, folder: 'inbox', dismissed: true });
  expect(result.error).toBeTruthy();
  expect(result.error).not.toContain('private');
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
