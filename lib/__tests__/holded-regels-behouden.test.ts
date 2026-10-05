import { describe, expect, it } from 'vitest';
import { behoudLokaleRegelinfo } from '../holded/regels-behouden';

const uitHolded = (name: string, price: number, units = 1) => ({ name, price, units, taxRate: 21 });

describe('factuurregels opnieuw ophalen uit Holded', () => {
  it('bewaart productkoppeling en kostprijs als de regel niet veranderd is', () => {
    const lokaal = [{ name: 'Wash basin 400×600', price: 190.04, units: 6, taxRate: 21, productId: 'p1', category: 'materiaal' }];
    const [r] = behoudLokaleRegelinfo([uitHolded('Wash basin 400×600', 190.04, 6)], lokaal);
    expect(r.productId).toBe('p1');
    expect(r.category).toBe('materiaal');
  });

  it('neemt de bedragen en aantallen van Holded over, niet de lokale', () => {
    const lokaal = [{ name: 'Magic stone', price: 8894.96, units: 1, costEur: 2223.74 }];
    const [r] = behoudLokaleRegelinfo([{ ...uitHolded('Magic stone', 8894.96), units: 1, taxRate: 0 }], lokaal);
    expect(r.taxRate).toBe(0);
    expect(r.costEur).toBe(2223.74);
  });

  it('vindt de regel ook als hij in Holded verschoven is', () => {
    const lokaal = [
      { name: 'Kranen', price: 297.48, units: 7, productId: 'kraan' },
      { name: 'Spiegels', price: 206.57, units: 6, productId: 'spiegel' },
    ];
    const r = behoudLokaleRegelinfo([uitHolded('Spiegels', 206.57, 6), uitHolded('Kranen', 297.48, 7)], lokaal);
    expect(r.map(x => x.productId)).toEqual(['spiegel', 'kraan']);
  });

  it('geeft een in Holded aangepaste regel niets mee — een oude kostprijs zou liegen', () => {
    const lokaal = [{ name: 'Kranen', price: 297.48, units: 7, productId: 'kraan', costEur: 140.04 }];
    const [r] = behoudLokaleRegelinfo([uitHolded('Kranen', 279.0, 7)], lokaal);
    expect(r.productId).toBeUndefined();
    expect(r.costEur).toBeUndefined();
  });

  it('koppelt twee gelijke regels elk aan hun eigen lokale regel', () => {
    const lokaal = [
      { name: 'Toiletaccessoires', price: 24.75, units: 15, productId: 'haak' },
      { name: 'Toiletaccessoires', price: 24.75, units: 15, productId: 'haak-2' },
    ];
    const r = behoudLokaleRegelinfo([uitHolded('Toiletaccessoires', 24.75, 15), uitHolded('Toiletaccessoires', 24.75, 15)], lokaal);
    expect(r.map(x => x.productId)).toEqual(['haak', 'haak-2']);
  });

  it('een nieuwe regel uit Holded blijft zoals hij is', () => {
    const [r] = behoudLokaleRegelinfo([uitHolded('Nieuwe regel', 10)], []);
    expect(r).toEqual(uitHolded('Nieuwe regel', 10));
  });
});
