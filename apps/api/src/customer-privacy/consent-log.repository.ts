import { Repository } from '../common/persistence';
import {
  ConsentLog,
  CreateConsentLogData,
  UpdateConsentLogData,
} from './consent-log';

export abstract class ConsentLogRepository extends Repository<
  ConsentLog,
  CreateConsentLogData,
  UpdateConsentLogData
> {
  /** Newest decision first. Account-level and per-business rows are both included. */
  abstract listForUser(userId: string): Promise<ConsentLog[]>;
}
