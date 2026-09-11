import { Repository } from '../common/persistence';
import {
  CreateIdempotencyKeyData,
  IdempotencyKey,
  UpdateIdempotencyKeyData,
} from './idempotency-key';

export abstract class IdempotencyKeyRepository extends Repository<
  IdempotencyKey,
  CreateIdempotencyKeyData,
  UpdateIdempotencyKeyData
> {
  abstract findByScopeAndKey(
    scope: string,
    key: string,
  ): Promise<IdempotencyKey | null>;
}
