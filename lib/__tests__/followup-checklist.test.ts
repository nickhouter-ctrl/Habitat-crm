import { describe, expect, it } from 'vitest';
import { FOLLOWUP_DONE, FOLLOWUP_REOPENED, followupCompleted, sortFollowup, type FollowupWorkRow } from '../followup-checklist';

const event = { id: 'done', subject: FOLLOWUP_DONE, createdAt: new Date('2026-10-02T09:00:00Z') };
describe('opvolging afvinken en opnieuw oppakken', () => {
  it('bewaart afhandeling voor oude reacties en de zojuist afgeronde opvolgdatum', () => {
    expect(followupCompleted(event, new Date('2026-10-01'), '2026-10-02', '2026-10-03')).toBe(true);
  });
  it('zet een nieuwe klantreactie terug in de open werklijst', () => {
    expect(followupCompleted(event, new Date('2026-10-02T10:00:00Z'), null, '2026-10-02')).toBe(false);
  });
  it('heropent op een volgende opvolgdatum en houdt toekomstige afspraken intact', () => {
    expect(followupCompleted(event, null, '2026-10-05', '2026-10-04')).toBe(true);
    expect(followupCompleted(event, null, '2026-10-05', '2026-10-05')).toBe(false);
  });
  it('houdt een handmatig heropend contact en contacten zonder afhandeling open', () => {
    expect(followupCompleted({ ...event, subject: FOLLOWUP_REOPENED }, null, null, '2026-10-02')).toBe(false);
    expect(followupCompleted(undefined, null, null, '2026-10-02')).toBe(false);
  });
  it('bepaalt de afgeronde dag in Madrid, ook rond middernacht', () => {
    expect(followupCompleted({ ...event, createdAt: new Date('2026-10-02T22:30:00Z') }, null, '2026-10-03', '2026-10-03')).toBe(true);
  });
});

function row(id: string, patch: Partial<FollowupWorkRow> = {}): FollowupWorkRow {
  return { contact: { id, name: id }, company: null, completed: false, state: 'Nog benaderen', due: false, profile: null, ...patch };
}
describe('sorteerbare werklijst', () => {
  it('zet antwoorden en vervallen acties vóór nieuwe contacten, wachtenden en afhandeling', () => {
    const rows = [row('afgerond', { completed: true }), row('wacht', { out: '2026-10-01' }), row('nieuw'), row('actie', { due: true }), row('antwoord', { state: 'Antwoord nodig' })];
    expect(sortFollowup(rows, 'priority', false).map(r => r.contact.id)).toEqual(['antwoord', 'actie', 'nieuw', 'wacht', 'afgerond']);
    expect(rows[0].contact.id).toBe('afgerond');
  });
  it('sorteert naam en bedrijf in beide richtingen', () => {
    const rows = [row('Zara', { company: 'Alpha' }), row('Ana', { company: 'Zulu' })];
    expect(sortFollowup(rows, 'name', true)[0].contact.id).toBe('Zara');
    expect(sortFollowup(rows, 'company', false)[0].contact.id).toBe('Zara');
    expect(sortFollowup(rows, 'company', true)[0].contact.id).toBe('Ana');
  });
  it('houdt ontbrekende opvolgdatums onderaan in beide richtingen', () => {
    const rows = [row('zonder'), row('vroeg', { profile: { nextActionOn: '2026-10-03' } }), row('laat', { profile: { nextActionOn: '2026-10-05' } })];
    expect(sortFollowup(rows, 'next', false).map(r => r.contact.id)).toEqual(['vroeg', 'laat', 'zonder']);
    expect(sortFollowup(rows, 'next', true).map(r => r.contact.id)).toEqual(['laat', 'vroeg', 'zonder']);
  });
  it('laat de recentste persoonlijke mail eerst zien, zonder gemailde contacten te verzinnen', () => {
    expect(sortFollowup([row('zonder'), row('oud', { out: '2026-10-01' }), row('nieuw', { out: '2026-10-02' })], 'last', true).map(r => r.contact.id)).toEqual(['nieuw', 'oud', 'zonder']);
  });
});
