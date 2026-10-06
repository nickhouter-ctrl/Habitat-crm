import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
import { afspraakMoment, afspraakTaal, afspraakUitnodigingMail } from '../afspraak-reactie';
import { kanReageren, openMomenten } from '../afspraak-reactie-db';

const LINK = 'https://crm.test/afspraak/abcdefghijklmnopqrstuvwx';
// 6 oktober 2026, 10:00 in Spanje = 08:00 UTC.
const TIEN_UUR = new Date('2026-10-06T08:00:00Z');

describe('afspraakvoorstel aan de klant', () => {
  it('toont het moment in Spaanse tijd, ook als de server in UTC draait', () => {
    expect(afspraakMoment(TIEN_UUR, 'es')).toContain('10:00');
    expect(afspraakMoment(TIEN_UUR, 'nl')).toMatch(/dinsdag 6 oktober 2026.*10:00/);
  });

  it('kiest de taal uit het dossier, met tweetalig als Spaans', () => {
    expect(afspraakTaal('en-es')).toBe('es');
    expect(afspraakTaal(null, 'de')).toBe('de');
    expect(afspraakTaal('fr', undefined)).toBe('es');
  });

  it('vast moment: akkoord of ander moment, en de knoppen leggen zelf niets vast', () => {
    const m = afspraakUitnodigingMail({ soort: 'fixed', taal: 'es', naam: 'Raúl', momenten: [TIEN_UUR], locatie: 'Showroom Jávea', link: LINK });
    expect(m.subject).toBe('Confirmación de nuestra cita');
    expect(m.html).toContain(`${LINK}?actie=akkoord`);
    expect(m.html).toContain(`${LINK}?actie=anders`);
    expect(m.text).toContain('Aceptar:');
    expect(m.text).toContain('hora de España');
  });

  it('meerdere momenten: één knop per moment', () => {
    const momenten = [TIEN_UUR, new Date('2026-10-07T13:30:00Z'), new Date('2026-10-08T08:00:00Z')];
    const m = afspraakUitnodigingMail({ soort: 'choice', taal: 'en', naam: 'Ana', momenten, link: LINK });
    expect(m.subject).toBe('Proposed times for an appointment');
    for (const i of [0, 1, 2]) expect(m.html).toContain(`${LINK}?kies=${i}`);
    expect(m.html).toContain('15:30'); // 13:30 UTC = 15:30 in Spanje
  });

  it('klant laten kiezen: geen moment, wel de vraag', () => {
    const m = afspraakUitnodigingMail({ soort: 'open', taal: 'nl', naam: 'Hans', momenten: [], link: LINK });
    expect(m.subject).toBe('Wanneer komt een afspraak je uit?');
    expect(m.html).toContain('Moment doorgeven');
    expect(m.html).not.toContain('?kies=');
  });

  it('gaat niet uit van de showroom, en ontsmet het persoonlijke bericht', () => {
    const m = afspraakUitnodigingMail({ soort: 'fixed', taal: 'nl', momenten: [TIEN_UUR], locatie: 'Bij de klant, Calle Mayor 3', bericht: '<b>tot dan</b>', link: LINK });
    expect(m.html).not.toMatch(/showroom/i);
    expect(m.html).toContain('&lt;b&gt;tot dan&lt;/b&gt;');
  });
});

describe('wat de klant nog kan', () => {
  const nu = Date.parse('2026-10-06T08:00:00Z');
  const inv = (x: object = {}) => ({ status: 'pending', slots: ['2026-10-05T08:00:00Z', '2026-10-09T08:00:00Z'], ...x }) as never;
  it('biedt alleen momenten aan die nog niet voorbij zijn', () => {
    expect(openMomenten(inv(), nu).map((m) => m.index)).toEqual([1]);
  });
  it('kan niet meer reageren op een ingetrokken voorstel of een begonnen afspraak', () => {
    expect(kanReageren({ inv: inv({ status: 'cancelled' }), afspraak: null }, nu)).toBe(false);
    const afspraak = (startsAt: string, status = 'scheduled') => ({ startsAt: new Date(startsAt), status, completedAt: null }) as never;
    expect(kanReageren({ inv: inv(), afspraak: afspraak('2026-10-06T07:00:00Z') }, nu)).toBe(false);
    expect(kanReageren({ inv: inv(), afspraak: afspraak('2026-10-07T07:00:00Z', 'cancelled') }, nu)).toBe(false);
    expect(kanReageren({ inv: inv(), afspraak: afspraak('2026-10-07T07:00:00Z') }, nu)).toBe(true);
    expect(kanReageren({ inv: inv(), afspraak: null }, nu)).toBe(true);
  });
});
