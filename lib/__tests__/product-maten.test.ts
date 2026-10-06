import { describe, expect, it } from 'vitest';
import { leesMaat, maatRegels, perM2 } from '../product-maten';

describe('maten en m²-prijzen per paneel', () => {
  it('leest de gangbare schrijfwijzen van een maat', () => {
    expect(leesMaat('2950*565')).toEqual([2950, 565]);
    expect(leesMaat('2400 × 590 mm')).toEqual([2400, 590]);
    expect(leesMaat('2400x1200')).toEqual([2400, 1200]);
    expect(leesMaat('op aanvraag')).toBeNull();
  });

  it('rekent oppervlakte en prijs per m² uit, en toont de hoofdmaat niet dubbel', () => {
    const r = maatRegels({
      sku: 'MS-347', widthMm: '2950.00', heightMm: '1130.00', priceEur: '247.8926', costEur: '82.31',
      additionalSizes: [
        { sku: 'MS-347-1', label: '2950*565', priceEur: 123.9256 },
        { sku: 'MS-347-2', label: '2950*1130', priceEur: 247.8926 },
      ],
    });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ afmeting: '2950 × 1130', m2: 3.3335, hoofd: true });
    expect(perM2(r[0].prijs, r[0].m2)).toBe(74.36);
    expect(r[1]).toMatchObject({ sku: 'MS-347-1', afmeting: '2950 × 565', hoofd: false });
  });

  it('zonder maat blijft de m²-prijs leeg in plaats van te raden', () => {
    const [r] = maatRegels({ sku: 'X', priceEur: 100 });
    expect(r.m2).toBeNull();
    expect(perM2(r.prijs, r.m2)).toBeNull();
  });
});
