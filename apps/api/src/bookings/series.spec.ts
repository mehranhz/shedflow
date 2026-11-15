import { commitSeriesAllOrNothing, weeklyStarts } from './series';

describe('customer recurring series (T-053)', () => {
  it('plans at most 12 weekly occurrences', () => {
    const start = new Date('2026-11-16T15:00:00.000Z');
    const dates = weeklyStarts(start, 12);
    expect(dates).toHaveLength(12);
    expect(dates[0]?.toISOString()).toBe(start.toISOString());
    expect(dates[11]!.getTime() - start.getTime()).toBe(11 * 7 * 24 * 60 * 60 * 1000);
    expect(() => weeklyStarts(start, 13)).toThrow('OCCURRENCE_COUNT');
    expect(() => weeklyStarts(start, 0)).toThrow('OCCURRENCE_COUNT');
  });

  it('fails the entire batch when any occurrence conflicts', () => {
    const inserted: number[] = [];
    expect(() =>
      commitSeriesAllOrNothing([1, 2, 3], (slot) => {
        if (slot === 2) {
          throw new Error('conflict');
        }
        inserted.push(slot);
      }),
    ).toThrow('SERIES_CONFLICT');
    expect(inserted).toEqual([1]);
    const ok = commitSeriesAllOrNothing([1, 2], (slot) => {
      if (slot < 0) {
        throw new Error('conflict');
      }
    });
    expect(ok).toEqual([1, 2]);
  });
});
