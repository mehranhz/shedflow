import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_METADATA = 'idempotent';

/** Marks a mutating route as requiring `Idempotency-Key` (see mvp/03 §7). */
export const Idempotent = () => SetMetadata(IDEMPOTENT_METADATA, true);

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_IN_FLIGHT_STATUS = 0;
