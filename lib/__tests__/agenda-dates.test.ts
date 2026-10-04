import { describe, expect, it } from 'vitest';
import { agendaDateTime, agendaDay, agendaRange, adjacentPeriod, validDay } from '../agenda-dates';
describe('Madrid agenda dates',()=>{
  it('rejects invalid calendar input and non-existing spring clock times',()=>{
    expect(validDay('2026-02-30')).toBe(false);expect(validDay('2026-10-04')).toBe(true);
    expect(agendaDateTime('2026-03-29','02:30')).toBeNull();expect(agendaDateTime('2026-10-04','24:00')).toBeNull();
  });
  it('preserves local dates, winter/summer offsets and late evening appointments',()=>{
    expect(agendaDateTime('2026-10-04','17:00')?.toISOString()).toBe('2026-10-04T15:00:00.000Z');
    expect(agendaDateTime('2026-12-04','17:00')?.toISOString()).toBe('2026-12-04T16:00:00.000Z');
    expect(agendaDay(new Date('2026-10-03T22:30:00Z'))).toBe('2026-10-04');
    expect(agendaDateTime('2026-10-25','02:30')).not.toBeNull();
  });
  it('starts every calendar on Monday and handles month/year and DST boundaries',()=>{
    const month=agendaRange('2026-10-04','month');expect(month.days).toHaveLength(42);expect(month.days[0]).toBe('2026-09-28');
    const week=agendaRange('2026-03-29','week');expect(week.days[0]).toBe('2026-03-23');expect((+week.end-+week.start)/3600000).toBe(167);
    expect(adjacentPeriod('2026-12-31','month',1)).toBe('2027-01-01');expect(adjacentPeriod('2026-10-04','week',-1)).toBe('2026-09-27');
  });
});
