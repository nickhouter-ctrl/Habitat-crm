import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ select: vi.fn(), mail: vi.fn(), gemarkeerd: vi.fn(), postvak: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: m.select }) }) }) }) }),
  update: () => ({ set: () => ({ where: (...a: unknown[]) => { m.gemarkeerd(...a); return Promise.resolve([]); } }) }),
} }));
vi.mock('@/lib/email', () => ({ sendEmail: m.mail, brandedEmail: (b: string) => b, escapeHtml: (s: string) => s }));
vi.mock('@/lib/crm-url', () => ({ crmUrl: () => 'https://crm.test' }));
vi.mock('@/lib/mail-visibility', () => ({ marketingMailbox: m.postvak, geenInkoopmail: () => undefined }));
import { notifyFollowupReplies } from '../followup-reply-notify';

const reactie = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001', fromEmail: 'ana@estudio.es', fromName: 'Ana',
  subject: 'Re: Welkom in onze showroom', tekst: 'Graag langskomen volgende week.',
  receivedAt: new Date('2026-10-03T09:00:00Z'), mailboxUser: 'hi@habitat-one.com',
  contactId: '00000000-0000-4000-8000-0000000000aa', contactNaam: 'Ana Ruiz', afzender: null, ...over,
});
beforeEach(() => { vi.resetAllMocks(); m.postvak.mockReturnValue('teresa@habitat-one.com'); m.mail.mockResolvedValue({ sent: true }); });

describe('melding dat een klant op onze opvolgmail reageerde', () => {
  it('stuurt niets als er geen nieuwe reactie is', async () => {
    m.select.mockResolvedValue([]);
    expect(await notifyFollowupReplies()).toEqual({ sent: false, count: 0 });
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.gemarkeerd).not.toHaveBeenCalled();
  });

  it('bundelt alle reacties in één mail — niet één per klant', async () => {
    m.select.mockResolvedValue([reactie(), reactie({ id: 'b', contactNaam: 'Luis Soler', fromEmail: 'luis@obra.es' })]);
    const r = await notifyFollowupReplies();
    expect(r).toEqual({ sent: true, count: 2 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    const mail = m.mail.mock.calls[0][0];
    expect(mail.subject).toContain('2 klanten');
    expect(mail.html).toContain('Ana Ruiz');
    expect(mail.html).toContain('Luis Soler');
    expect(mail.html).toContain('https://crm.test/opvolging/00000000-0000-4000-8000-0000000000aa');
  });

  it('zet degene die de opvolgmail verstuurde in de kopie', async () => {
    m.select.mockResolvedValue([reactie({ afzender: 'mourad.h@habitat-one.com' })]);
    await notifyFollowupReplies();
    expect(m.mail.mock.calls[0][0].bcc).toContain('mourad.h@habitat-one.com');
  });

  it('houdt een reactie in het privépostvak bij die ene persoon', async () => {
    m.select.mockResolvedValue([
      reactie(),
      reactie({ id: 'c', mailboxUser: 'teresa@habitat-one.com', contactNaam: 'Marta Gil', afzender: 'teresa@habitat-one.com' }),
    ]);
    await notifyFollowupReplies();
    expect(m.mail).toHaveBeenCalledTimes(2);
    const team = m.mail.mock.calls.find(c => c[0].to === 'nick@habitat-one.com')![0];
    const prive = m.mail.mock.calls.find(c => c[0].to === 'teresa@habitat-one.com')![0];
    expect(team.html).not.toContain('Marta Gil');
    expect(prive.html).toContain('Marta Gil');
    expect(prive.html).not.toContain('Ana Ruiz');
    // Geen bedrijfskopie: haar klantmail blijft van haar.
    expect(prive.noCompanyBcc).toBe(true);
    expect(prive.bcc).toBeUndefined();
  });

  it('markeert de reacties ook als de melding niet verstuurd kon worden', async () => {
    m.select.mockResolvedValue([reactie()]);
    m.mail.mockResolvedValue({ sent: false, reason: 'smtp' });
    expect(await notifyFollowupReplies()).toEqual({ sent: false, count: 1 });
    expect(m.gemarkeerd).toHaveBeenCalledTimes(1);
  });
});
