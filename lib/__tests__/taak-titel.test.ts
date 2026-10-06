import { describe, expect, it } from 'vitest';
import { maakT } from '../i18n';
import { taakTitel } from '../taak-titel';

describe('taaktitels in de taal van wie kijkt', () => {
  const es = maakT('es');
  it('vertaalt de vaste opvolgtaak', () => {
    expect(taakTitel('Opvolging', es)).toBe('Seguimiento');
    expect(taakTitel('Beursopvolging', es)).toBe('Seguimiento de feria');
  });
  it('vertaalt "Afspraak plannen met" en laat de naam staan', () => {
    expect(taakTitel('Afspraak plannen met Raul Martinez', es)).toBe('Concertar una cita con Raul Martinez');
    expect(taakTitel('Arrange an appointment with Carmen Loque', maakT('nl'))).toBe('Afspraak plannen met Carmen Loque');
  });
  it('laat zelf getypte titels ongemoeid', () => {
    expect(taakTitel('Stalen klaarleggen voor Lamiplast', es)).toBe('Stalen klaarleggen voor Lamiplast');
    expect(taakTitel(null, es)).toBe('');
  });
});
