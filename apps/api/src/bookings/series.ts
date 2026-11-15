/** Weekly occurrences for the customer recurring slice (T-053). Max 12. */
export function weeklyStarts(startAt: Date, count: number): Date[] {
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    throw new RangeError('OCCURRENCE_COUNT');
  }
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(startAt.getTime());
    next.setUTCDate(next.getUTCDate() + index * 7);
    return next;
  });
}

/**
 * All-or-nothing series insert contract.
 * A conflict discards every staged row — the booking service enforces that
 * with one database transaction around the real inserts.
 */
export function commitSeriesAllOrNothing<T>(
  slots: T[],
  insert: (slot: T) => void,
): T[] {
  const staged: T[] = [];
  for (const slot of slots) {
    try {
      insert(slot);
    } catch (error) {
      staged.length = 0;
      const wrapped = new Error('SERIES_CONFLICT');
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    }
    staged.push(slot);
  }
  return staged;
}
