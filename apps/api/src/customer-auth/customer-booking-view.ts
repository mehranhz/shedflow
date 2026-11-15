const ACTIVE = new Set([
  'PENDING_PAYMENT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
]);

const TERMINAL = new Set(['CANCELLED', 'RESCHEDULED', 'EXPIRED', 'NO_SHOW']);

const ATTACHMENT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/** 5 MB. Link-only attachments store this declared size; binaries are not uploaded. */
export const CUSTOMER_ATTACHMENT_MAX_BYTES = 5_000_000;
export const CUSTOMER_NOTE_MAX_LENGTH = 2000;
export const CUSTOMER_ATTACHMENT_MAX_COUNT = 5;

export type PolicyBlock = 'OUTSIDE_POLICY' | 'CONFLICT' | null;

export type CustomerPolicyView = {
  cancellationNoticeHours: number;
  rescheduleNoticeHours: number;
  noShowPolicySummary: string;
  canCancel: boolean;
  canReschedule: boolean;
  cancelBlockedReason: PolicyBlock;
  rescheduleBlockedReason: PolicyBlock;
};

export function evaluateCustomerPolicy(input: {
  now: Date;
  startAt: Date;
  status: string;
  cancellationNoticeHours: number;
  rescheduleNoticeHours: number;
}): CustomerPolicyView {
  const terminal = TERMINAL.has(input.status);
  const started = input.startAt.getTime() <= input.now.getTime();
  const cancelDeadline =
    input.startAt.getTime() - input.cancellationNoticeHours * 3_600_000;
  const rescheduleDeadline =
    input.startAt.getTime() - input.rescheduleNoticeHours * 3_600_000;
  const outsideCancel = input.now.getTime() > cancelDeadline;
  const outsideReschedule = input.now.getTime() > rescheduleDeadline;
  const active = ACTIVE.has(input.status);
  const blocked = (outside: boolean): PolicyBlock => {
    if (terminal || started || !active) {
      return 'CONFLICT';
    }
    return outside ? 'OUTSIDE_POLICY' : null;
  };
  const cancelBlockedReason = blocked(outsideCancel);
  const rescheduleBlockedReason = blocked(outsideReschedule);
  return {
    cancellationNoticeHours: input.cancellationNoticeHours,
    rescheduleNoticeHours: input.rescheduleNoticeHours,
    noShowPolicySummary:
      'If you miss this appointment without cancelling in time, the host may mark it as a no-show. Book again or contact the business.',
    canCancel: cancelBlockedReason === null,
    canReschedule: rescheduleBlockedReason === null,
    cancelBlockedReason,
    rescheduleBlockedReason,
  };
}

export function customerNoteEditable(
  startAt: Date,
  now: Date,
  status: string,
): boolean {
  if (TERMINAL.has(status)) {
    return false;
  }
  return startAt.getTime() > now.getTime();
}

export type AttachmentLinkInput = {
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

export function validateAttachmentLink(
  input: AttachmentLinkInput,
): { ok: true } | { ok: false; field: string; message: string } {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, field: 'url', message: 'Enter a valid https URL' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, field: 'url', message: 'Only https links are allowed' };
  }
  if (!ATTACHMENT_MIME.has(input.mimeType)) {
    return {
      ok: false,
      field: 'mimeType',
      message: 'Use a JPEG, PNG, WebP, or PDF',
    };
  }
  if (
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > CUSTOMER_ATTACHMENT_MAX_BYTES
  ) {
    return {
      ok: false,
      field: 'sizeBytes',
      message: 'File must be 5 MB or smaller',
    };
  }
  const name = input.name.trim();
  if (!name || name.length > 180) {
    return { ok: false, field: 'name', message: 'Enter a file name' };
  }
  return { ok: true };
}

/**
 * Binary virus scanning is not wired: the portal stores an https link only.
 * This hook is the place a scanner will run once object storage exists.
 */
export function virusScanHook(url: string): { status: 'skipped'; url: string } {
  return { status: 'skipped', url };
}
