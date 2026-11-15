import {
  customerNoteEditable,
  evaluateCustomerPolicy,
  validateAttachmentLink,
} from './customer-booking-view';

describe('customer booking policy DTO (T-052)', () => {
  const start = new Date('2026-12-01T15:00:00.000Z');

  it('allows cancel and reschedule inside the notice window', () => {
    const policy = evaluateCustomerPolicy({
      now: new Date('2026-11-20T15:00:00.000Z'),
      startAt: start,
      status: 'CONFIRMED',
      cancellationNoticeHours: 24,
      rescheduleNoticeHours: 24,
    });
    expect(policy.canCancel).toBe(true);
    expect(policy.canReschedule).toBe(true);
    expect(policy.cancelBlockedReason).toBeNull();
    expect(policy.cancellationNoticeHours).toBe(24);
    expect(policy.noShowPolicySummary.length).toBeGreaterThan(0);
  });

  it('blocks cancel outside the notice window', () => {
    const policy = evaluateCustomerPolicy({
      now: new Date('2026-12-01T10:00:00.000Z'),
      startAt: start,
      status: 'CONFIRMED',
      cancellationNoticeHours: 24,
      rescheduleNoticeHours: 24,
    });
    expect(policy.canCancel).toBe(false);
    expect(policy.cancelBlockedReason).toBe('OUTSIDE_POLICY');
  });

  it('marks no-show as not cancellable', () => {
    const policy = evaluateCustomerPolicy({
      now: new Date('2026-12-02T15:00:00.000Z'),
      startAt: start,
      status: 'NO_SHOW',
      cancellationNoticeHours: 24,
      rescheduleNoticeHours: 24,
    });
    expect(policy.canCancel).toBe(false);
    expect(policy.cancelBlockedReason).toBe('CONFLICT');
  });
});

describe('customer notes and attachment links (T-054)', () => {
  it('locks the note once the appointment has started', () => {
    const start = new Date('2026-12-01T15:00:00.000Z');
    expect(customerNoteEditable(start, new Date('2026-12-01T14:00:00.000Z'), 'CONFIRMED')).toBe(
      true,
    );
    expect(customerNoteEditable(start, new Date('2026-12-01T15:00:00.000Z'), 'CONFIRMED')).toBe(
      false,
    );
    expect(customerNoteEditable(start, new Date('2026-11-01T15:00:00.000Z'), 'CANCELLED')).toBe(
      false,
    );
  });

  it('rejects oversized or non-https attachments', () => {
    expect(
      validateAttachmentLink({
        url: 'https://files.example/receipt.pdf',
        name: 'receipt.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1200,
      }).ok,
    ).toBe(true);
    const huge = validateAttachmentLink({
      url: 'https://files.example/scan.png',
      name: 'scan.png',
      mimeType: 'image/png',
      sizeBytes: 5_000_001,
    });
    expect(huge).toMatchObject({ ok: false, field: 'sizeBytes' });
    const http = validateAttachmentLink({
      url: 'http://files.example/scan.png',
      name: 'scan.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    });
    expect(http).toMatchObject({ ok: false, field: 'url' });
    const mime = validateAttachmentLink({
      url: 'https://files.example/notes.txt',
      name: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
    });
    expect(mime).toMatchObject({ ok: false, field: 'mimeType' });
  });
});
