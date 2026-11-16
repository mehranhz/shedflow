import { Repository } from '../common/persistence';
import {
  CreateTotpCredentialData,
  TotpCredential,
  UpdateTotpCredentialData,
} from './totp-credential';

export abstract class TotpCredentialRepository extends Repository<
  TotpCredential,
  CreateTotpCredentialData,
  UpdateTotpCredentialData
> {
  abstract findByUserId(userId: string): Promise<TotpCredential | null>;
}
