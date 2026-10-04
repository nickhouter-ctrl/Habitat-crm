import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: m.send }) } }));
import { sendMail } from '@/lib/gmail';
import { sendEmail } from '@/lib/email';
import { isFairContact, isFairSource } from '@/lib/followup-source';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GMAIL_USER', 'hi@habitat-one.com');
  vi.stubEnv('GMAIL_APP_PASSWORD', 'test-only');
  vi.stubEnv('EMAIL_BCC', 'hans@habitat-one.com');
  m.send.mockResolvedValue({ messageId: 'smtp-test' });
});
afterEach(() => vi.unstubAllEnvs());

describe('vaste CC-afspraak op het SMTP-pad', () => {
  it('vervangt ook bij direct sendMail alle extra BCC door de twee CC-adressen', async () => {
    await sendMail({ to: 'klant@example.com', subject: 'Beurs', text: 'Hoi', bcc: 'hans@habitat-one.com, extra@example.com', copyPolicy: 'nick-frederique' });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'klant@example.com', cc: 'nick@habitat-one.com, frederique@habitat-one.com', bcc: undefined }));
  });
  it('behoudt de CC-afspraak wanneer sendEmail aan SMTP overdraagt', async () => {
    expect((await sendEmail({ to: 'klant@example.com', subject: 'Beurs', html: '<p>Hoi</p>', copyPolicy: 'nick-frederique' })).sent).toBe(true);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ cc: 'nick@habitat-one.com, frederique@habitat-one.com', bcc: undefined }));
  });
  it('voegt geen kopie toe aan een persoonlijke inlogmail', async () => {
    await sendEmail({ to: 'nick@habitat-one.com', subject: 'Persoonlijk', html: '<p>inloglink</p>', noCompanyBcc: true });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ cc: undefined, bcc: undefined }));
  });
  it('behoudt de bestaande standaardkopieën voor andere mails', async () => {
    await sendEmail({ to: 'leverancier@example.com', subject: 'Levering', html: '<p>Hoi</p>' });
    const args = m.send.mock.calls[0][0];
    expect(args.cc).toBeUndefined();
    expect(args.bcc).toContain('hi@habitat-one.com');
    expect(args.bcc).toContain('hans@habitat-one.com');
  });
  it('filtert systeemmeldingen op beide SMTP-ingangen, ook bij oude env en displaynamen', async () => {
    vi.stubEnv('EMAIL_BCC', 'HI@habitat-one.com, outsider@example.com, hans@habitat-one.com');
    for (const send of [sendEmail, sendMail]) {
      await send({ to: 'Info <HI@habitat-one.com>, Nick <NICK@habitat-one.com>', subject: 'Agenda', html: '<p>Taak</p>', bcc: 'hi@habitat-one.com, outsider@example.com, mourad.h@habitat-one.com', interneMelding: true });
      const args = m.send.mock.calls.at(-1)![0];
      expect(args.to).toBe('Nick <NICK@habitat-one.com>');
      expect(args.bcc).toContain('mourad.h@habitat-one.com');
      expect(args.bcc).not.toContain('hi@');
      expect(args.bcc).not.toContain('outsider');
      expect(args.bcc).not.toContain('nick@');
      expect(args.from).toContain('<hi@habitat-one.com>');
    }
  });
  it('weigert een persoonlijke systeemmelding zonder toegestane ontvanger en stuurt niet door', async () => {
    expect(await sendEmail({ to: 'hi@habitat-one.com', subject: 'Privé', html: '<p>Bericht</p>', interneMelding: true, noCompanyBcc: true })).toMatchObject({ sent: false, reason: 'system-recipient-not-allowed' });
    await expect(sendMail({ to: 'outsider@example.com', subject: 'Privé', interneMelding: true })).rejects.toThrow('system-recipient-not-allowed');
    expect(m.send).not.toHaveBeenCalled();
  });
  it('behoudt een privébericht uitsluitend voor zijn verantwoordelijke', async () => {
    await sendEmail({ to: 'teresa@habitat-one.com', subject: 'Taak', html: '<p>Privé</p>', noCompanyBcc: true, interneMelding: true });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'teresa@habitat-one.com', cc: undefined, bcc: undefined }));
  });
});

describe('herkomst van beursmails', () => {
  it('herkent registratie, oorspronkelijke beurs-tag en websiteafspraak', () => {
    expect(isFairContact({ source: 'beurs:360-cevisama-2026' })).toBe(true);
    expect(isFairContact({ source: 'crm', tags: ['rol:architect', 'beurs:28-september'] })).toBe(true);
    expect(isFairSource(' website:feria-360-cevisama-2026 ')).toBe(true);
  });
  it('leidt beursherkomst niet af uit beroep of vrije tekst', () => {
    expect(isFairContact({ source: 'website', tags: ['rol:wederverkoper'] })).toBe(false);
    expect(isFairSource('beurs besproken')).toBe(false);
    expect(isFairContact({})).toBe(false);
  });
});
