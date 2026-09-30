import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contractTerms, partnerContractDocument, partnerContractTemplate, readContractDetails } from '../partner-contract';

const m = vi.hoisted(() => ({ guard: vi.fn(), transaction: vi.fn(), contact: vi.fn(), previous: vi.fn(), insert: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requireModule: m.guard }));
vi.mock('@/lib/storage', () => ({ uploadDocumentFile: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { transaction: m.transaction } }));
import { createContract } from '../../app/(app)/wederverkopers/[id]/samenwerking/actions';

const id = '00000000-0000-4000-8000-000000000001';
const details = { brandName: 'Stone Example', assortment: 'Panelen en lijm', area: 'Valencia', minimumPurchases: '', service: 'Samples tonen', exceptions: '' };
function form() {
  const fd = new FormData();
  Object.entries({ ...details, contactId: id, formMode: 'guided', body: partnerContractTemplate('Voorbeeld BV'), validFrom: '2026-10-01', validUntil: '2027-09-30', exclusive: '', latitude: '', longitude: '', radiusKm: '' }).forEach(([k, v]) => fd.set(k, v));
  return fd;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.guard.mockResolvedValue({ id });
  m.contact.mockResolvedValue([{ id }]);
  m.previous.mockResolvedValue([{ version: 3 }]);
  m.insert.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async fn => fn({
    select: () => ({ from: () => ({ where: () => ({ for: m.contact, orderBy: () => ({ limit: m.previous }) }) }) }),
    insert: () => ({ values: m.insert }),
  }));
});

describe('geleid contract opslaan', () => {
  it('vereist rechten voordat het formulier of de database wordt verwerkt', async () => {
    m.guard.mockRejectedValue(new Error('Geen toegang'));
    await expect(createContract({}, new FormData())).rejects.toThrow('Geen toegang');
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('bouwt de bijlage op de server en bewaart een nieuwe versie zonder oude versies te wijzigen', async () => {
    const fd = form();
    fd.set('territoryTerms', 'Client probeert andere voorwaarden in te voegen');
    expect((await createContract({}, fd)).success).toBeTruthy();
    const saved = m.insert.mock.calls[0][0];
    expect(saved).toMatchObject({ contactId: id, version: 4, territoryTerms: contractTerms(details), legalReviewed: false });
    expect(saved.body).toContain('[MERKNAAM]');
    expect(partnerContractDocument(saved)).toContain('De definitieve eigen merknaam is Stone Example');
    expect(partnerContractDocument(saved)).not.toContain('Client probeert');
    expect(m.insert).toHaveBeenCalledTimes(2); // versie en auditnotitie
  });
  it('laat een nog onbekende merknaam als concept toe, maar niet als juridisch gecontroleerd', async () => {
    const fd = form(); fd.set('brandName', '');
    expect((await createContract({}, fd)).success).toBeTruthy();
    m.transaction.mockClear(); fd.set('legalReviewed', 'on');
    expect((await createContract({}, fd)).error).toContain('definitieve merknaam');
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('bewaart lange bestaande vrije afspraken zonder ze af te knippen', async () => {
    const fd = form(); fd.set('exceptions', 'x'.repeat(6000));
    expect((await createContract({}, fd)).success).toBeTruthy();
    expect(readContractDetails(m.insert.mock.calls[0][0].territoryTerms)?.exceptions).toHaveLength(6000);
  });
  it('weigert een exclusief gebied zonder middelpunt of straal', async () => {
    const fd = form(); fd.set('exclusive', 'on');
    expect((await createContract({}, fd)).error).toContain('middelpunt en straal');
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('weigert ongeldige looptijden en ontbrekende producten voor opslag', async () => {
    const fd = form(); fd.set('validUntil', '2026-09-30');
    expect((await createContract({}, fd)).error).toContain('Einddatum');
    fd.set('validUntil', '2027-09-30'); fd.set('assortment', '');
    expect((await createContract({}, fd)).error).toContain('producten');
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('houdt oude vrije contractformulieren bruikbaar', async () => {
    const fd = form(); fd.delete('formMode'); fd.set('territoryTerms', 'Bestaande gebiedsafspraak letterlijk behouden.');
    expect((await createContract({}, fd)).success).toBeTruthy();
    expect(m.insert.mock.calls[0][0].territoryTerms).toBe('Bestaande gebiedsafspraak letterlijk behouden.');
  });
});

describe('concept en download', () => {
  it('laat velden heropenen en voorkomt dat regeleinden extra velden toevoegen', () => {
    const terms = contractTerms({ ...details, service: 'Showroom\nMerknaam: ander merk' });
    expect(readContractDetails(terms)).toEqual({ ...details, service: 'Showroom Merknaam: ander merk' });
    expect(readContractDetails('Oude vrije tekst blijft letterlijk staan.')).toBeNull();
  });
  it('past een gewijzigde merknaam toe op de nieuwe versie en bewaart de oorspronkelijke versie', () => {
    const old = { body: partnerContractTemplate('Voorbeeld BV'), territoryTerms: contractTerms(details), validFrom: '2026-10-01', validUntil: '2027-09-30', exclusive: true, latitude: '39.47', longitude: '-0.38', radiusKm: '10', version: 4 };
    const original = partnerContractDocument(old);
    const changed = partnerContractDocument({ ...old, territoryTerms: contractTerms({ ...details, brandName: 'New Example' }), version: 5 });
    expect(original).toContain('Stone Example'); expect(original).toContain('straal 10 km');
    expect(changed).toContain('De definitieve eigen merknaam is New Example');
    expect(changed).not.toContain('Stone Example');
    expect(partnerContractDocument(old)).toBe(original);
  });
});
