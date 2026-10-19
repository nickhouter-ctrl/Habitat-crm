import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), rateLimit: vi.fn(), action: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('@/lib/hermes/service', () => ({ executeAgentRequest: mocks.action, AgentConflict: class extends Error {} }));
import { POST } from './route';
const token = 'ab'.repeat(32);
const request = (body: string, auth = `Bearer ${token}`) => new Request('https://crm.habitat-one.com/api/hermes', { method:'POST', headers:{ authorization:auth,'content-type':'application/json'},body });
beforeEach(() => {
 vi.resetAllMocks();
 process.env.HERMES_AGENT_TOKEN_SHA256=createHash('sha256').update(token).digest('hex');
 process.env.HERMES_AGENT_OWNER_EMAIL='owner@example.test';
 mocks.execute.mockResolvedValue([{id:'owner-id'}]);mocks.rateLimit.mockResolvedValue(true);mocks.action.mockResolvedValue([]);
});
describe('Hermes HTTP boundary', () => {
 it('rejects unauthenticated calls before touching the database', async () => {
  expect((await POST(request('{}','Bearer wrong'))).status).toBe(401);expect(mocks.execute).not.toHaveBeenCalled();
 });
 it('denies revoked admin access', async () => {
  mocks.execute.mockResolvedValue([]);expect((await POST(request('{}'))).status).toBe(403);expect(mocks.action).not.toHaveBeenCalled();
 });
 it('rejects oversized bodies even without a content-length header', async () => {
  expect((await POST(request('x'.repeat(65537)))).status).toBe(413);expect(mocks.action).not.toHaveBeenCalled();
 });
 it('does not execute malformed or unsupported operations', async () => {
  for (const body of ['{', JSON.stringify({action:'send_email'}),JSON.stringify({action:'search',resource:'contacts',limit:999})]) expect((await POST(request(body))).status).toBe(400);
  expect(mocks.action).not.toHaveBeenCalled();
 });
 it('fails closed on rate limit and sanitizes database failures', async () => {
  mocks.rateLimit.mockResolvedValue(false);expect((await POST(request('{}'))).status).toBe(429);
  mocks.rateLimit.mockResolvedValue(true);mocks.action.mockRejectedValue(new Error('secret SQL detail'));
  const response=await POST(request(JSON.stringify({action:'search',resource:'contacts'})));
  expect(response.status).toBe(500);expect(await response.text()).not.toContain('secret');
 });
 it('passes only validated input and returns uncached results', async () => {
  const response=await POST(request(JSON.stringify({action:'search',resource:'contacts'})));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.action).toHaveBeenCalledWith({action:'search',resource:'contacts',query:'',limit:10},'owner-id');
 });
});
