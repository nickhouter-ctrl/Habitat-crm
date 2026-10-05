import { beforeEach, describe, expect, it, vi } from 'vitest';

// Een kleine nep-database: genoeg om te zien hoeveel berichten, taken en
// meldingen er ontstaan, en of een herhaald verzoek iets dubbel maakt.
const m = vi.hoisted(() => ({
  users: [] as { id: string; role: string }[],
  messages: new Map<string, { id: string; senderId: string; recipientId: string; taskId: string | null }>(),
  notices: new Map<string, { id: string; userId: string }>(),
  tasks: [] as { assigneeId: string }[],
  sent: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('drizzle-orm', () => ({
  and: (...c: unknown[]) => ({ and: c }), eq: (col: string, v: unknown) => ({ eq: [col, v] }),
  inArray: (col: string, v: unknown[]) => ({ in: [col, v] }), ne: (col: string, v: unknown) => ({ ne: [col, v] }),
  isNull: (c: unknown) => ({ isNull: c }),
}));
vi.mock('@/lib/db/schema', () => ({
  users: { t: 'users', id: 'users.id', role: 'users.role' },
  staffMessages: { t: 'messages', id: 'messages.id', recipientId: 'messages.recipientId', readAt: 'messages.readAt' },
  staffNotifications: { t: 'notices', id: 'notices.id', eventKey: 'notices.eventKey' },
  activities: { t: 'activities', id: 'activities.id' },
  contacts: { t: 'contacts', id: 'contacts.id' },
}));
vi.mock('@/lib/auth/guards', () => ({ requireModule: async () => ({ id: 'nick' }), requireModuleRead: async () => ({ id: 'nick' }) }));
vi.mock('@/lib/auth/modules', () => ({ heeftCap: () => true }));
vi.mock('@/lib/agenda-dates', () => ({ agendaDateTime: () => new Date('2026-10-05T15:00:00Z') }));
vi.mock('@/lib/staff-notifications', () => ({ sendQueuedStaffNotification: m.sent }));

type Cond = { eq?: [string, unknown]; in?: [string, unknown[]]; ne?: [string, unknown]; and?: Cond[] };
const voldoet = (rij: Record<string, unknown>, c: Cond): boolean => {
  if (c.and) return c.and.every(x => voldoet(rij, x));
  const veld = (k: string) => rij[k.split('.')[1]];
  if (c.eq) return veld(c.eq[0]) === c.eq[1];
  if (c.in) return c.in[1].includes(veld(c.in[0]));
  if (c.ne) return veld(c.ne[0]) !== c.ne[1];
  return true;
};
const tx = {
  select: () => ({ from: (tabel: { t: string }) => ({ where: (c: Cond) => {
    const rijen = tabel.t === 'users' ? m.users.filter(u => voldoet(u, c))
      : tabel.t === 'messages' ? [...m.messages.values()].filter(r => voldoet(r, c))
      : tabel.t === 'notices' ? [...m.notices.values()].filter(r => voldoet({ eventKey: [...m.notices.entries()].find(([, v]) => v === r)?.[0] }, c))
      : [];
    return Object.assign(Promise.resolve(rijen), { for: () => Promise.resolve(rijen) });
  } }) }),
  insert: (tabel: { t: string }) => ({ values: (v: Record<string, any>) => ({ returning: async () => {
    if (tabel.t === 'activities') { m.tasks.push({ assigneeId: v.assigneeId }); return [{ id: `taak-${m.tasks.length}` }]; }
    if (tabel.t === 'messages') { m.messages.set(v.id, { id: v.id, senderId: v.senderId, recipientId: v.recipientId, taskId: v.taskId }); return [{ id: v.id }]; }
    const id = `melding-${m.notices.size + 1}`; m.notices.set(v.eventKey, { id, userId: v.userId }); return [{ id }];
  } }) }),
};
vi.mock('@/lib/db', () => ({ db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx), update: vi.fn() } }));

import { sendTeamMessage } from '../../app/(app)/teamberichten/actions';

const FORM_ID = '11111111-1111-4111-8111-111111111111';
const MOURAD = '22222222-2222-4222-8222-222222222222';
function form(ontvanger: string, taak = true) {
  const f = new FormData();
  f.set('submissionId', FORM_ID); f.set('recipientId', ontvanger); f.set('contactId', '');
  f.set('subject', 'Showroom zaterdag open'); f.set('body', 'Zaterdag is de showroom open van 10 tot 14 uur.');
  if (taak) f.set('makeTask', 'on'); f.set('dueDate', '2026-10-10'); f.set('time', '10:00'); f.set('priority', 'middel');
  return f;
}

beforeEach(() => {
  m.users = [
    { id: 'nick', role: 'admin' }, { id: MOURAD, role: 'agent' },
    { id: 'teresa', role: 'marketing' }, { id: 'hans', role: 'agent' }, { id: 'boekhouder', role: 'viewer' },
  ];
  m.messages.clear(); m.notices.clear(); m.tasks = []; m.sent.mockReset(); m.sent.mockResolvedValue(true);
});

describe('teambericht naar het hele team', () => {
  it('krijgt iedere collega een eigen bericht, taak en melding — de afzender niet', async () => {
    const r = await sendTeamMessage({}, form('team'));
    expect(r.error).toBeUndefined();
    expect(r.aantal).toBe(3);
    const ontvangers = [...m.messages.values()].map(x => x.recipientId).sort();
    expect(ontvangers).toEqual([MOURAD, 'hans', 'teresa'].sort());
    expect(m.tasks.map(t => t.assigneeId).sort()).toEqual([MOURAD, 'hans', 'teresa'].sort());
    expect(m.sent).toHaveBeenCalledTimes(3);
  });

  it('slaat wie alleen mag lezen over: die kan geen taak oppakken', async () => {
    await sendTeamMessage({}, form('team'));
    expect([...m.messages.values()].some(x => x.recipientId === 'boekhouder')).toBe(false);
  });

  it('maakt bij een tweede klik op versturen niets dubbel', async () => {
    await sendTeamMessage({}, form('team'));
    const r = await sendTeamMessage({}, form('team'));
    expect(r.error).toBeUndefined();
    expect(m.messages.size).toBe(3);
    expect(m.tasks).toHaveLength(3);
    expect(m.notices.size).toBe(3);
  });

  it('zonder taak: alleen berichten, geen agenda-items', async () => {
    await sendTeamMessage({}, form('team', false));
    expect(m.messages.size).toBe(3);
    expect(m.tasks).toHaveLength(0);
  });

  it('meldt het eerlijk als niet elke e-mailmelding is bevestigd', async () => {
    m.sent.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const r = await sendTeamMessage({}, form('team'));
    expect(r.success).toContain('Niet alle e-mailmeldingen');
  });
});

describe('teambericht naar één collega blijft zoals het was', () => {
  it('één bericht, met het formulier-id als bericht-id', async () => {
    const r = await sendTeamMessage({}, form(MOURAD));
    expect(r.aantal).toBeUndefined();
    expect([...m.messages.keys()]).toEqual([FORM_ID]);
    expect(m.messages.get(FORM_ID)?.recipientId).toBe(MOURAD);
  });
});
