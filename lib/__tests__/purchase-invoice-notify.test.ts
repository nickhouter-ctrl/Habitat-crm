import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rows: vi.fn(), update: vi.fn(), mail: vi.fn(), token: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ where: () => {
    const result = m.rows();
    return Object.assign(result, { orderBy: () => result });
  } }) }),
  update: () => ({ set: () => ({ where: m.update }) }),
} }));
vi.mock('@/lib/email', () => ({ sendEmail: m.mail, brandedEmail: (s: string) => s, escapeHtml: (s: string) => s }));
vi.mock('@/lib/login-links', () => ({ getLoginToken: m.token }));
import { notifyNewInvoiceReviews, runPurchaseInvoiceDigest } from '@/lib/purchase-invoice-notify';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('INVOICE_NOTIFY_EMAILS', 'hans@habitat-one.com, hi@habitat-one.com, nick@habitat-one.com');
  vi.stubEnv('PURCHASE_INVOICE_DIGEST_ENABLED', 'true');
  m.rows.mockResolvedValueOnce([{ id: 'review-1', supplier: 'Test', reference: 'INV-1', total: '100', verdict: 'ok', findings: [], dagen: 8, token: 'review-token' }])
    .mockResolvedValueOnce([
      { id: 'nick-id', email: 'nick@habitat-one.com' },
      { id: 'fred-id', email: 'frederique@habitat-one.com' },
      { id: 'hans-id', email: 'hans@habitat-one.com' },
    ]);
  m.token.mockImplementation(async id => `personal-${id}`);
  m.mail.mockResolvedValue({ sent: true });
});
afterEach(() => vi.unstubAllEnvs());

function expectPrivateRecipients() {
  expect(m.mail.mock.calls.map(([mail]) => mail.to)).toEqual(['nick@habitat-one.com', 'frederique@habitat-one.com']);
  for (const [mail] of m.mail.mock.calls) {
    expect(mail.noCompanyBcc).toBe(true);
    expect(mail.bcc).toBeUndefined();
    expect(mail.copyPolicy).toBeUndefined();
  }
  const [nick, fred] = m.mail.mock.calls.map(([mail]) => mail.html);
  expect(nick).toContain('personal-nick-id'); expect(nick).not.toContain('personal-fred-id');
  expect(fred).toContain('personal-fred-id'); expect(fred).not.toContain('personal-nick-id');
  expect(nick).toContain('?w=nick-id'); expect(fred).toContain('?w=fred-id');
  expect(m.token).not.toHaveBeenCalledWith('hans-id', expect.anything());
}

describe('inkoopgoedkeuringsmails: uitsluitend Nick en Frederique', () => {
  it('beperkt nieuwe factuurmeldingen en behoudt persoonlijke goedkeur- en inloglinks', async () => {
    expect((await notifyNewInvoiceReviews(['review-1'])).sent).toBe(true);
    expectPrivateRecipients();
  });
  it('past dezelfde ontvangers toe op de ochtendsamenvatting, ongeacht oude env-instellingen', async () => {
    expect((await runPurchaseInvoiceDigest()).sent).toBe(true);
    expectPrivateRecipients();
  });
  it('stuurt geen melding wanneer er niets te beoordelen is', async () => {
    m.rows.mockReset().mockResolvedValue([]);
    expect((await runPurchaseInvoiceDigest()).sent).toBe(false);
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.token).not.toHaveBeenCalled();
  });
});
