import { Repository } from '../common/persistence';
import {
  CreateRefreshTokenData,
  RefreshToken,
  UpdateRefreshTokenData,
} from './refresh-token';

export abstract class RefreshTokenRepository extends Repository<
  RefreshToken,
  CreateRefreshTokenData,
  UpdateRefreshTokenData
> {
  abstract findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;

  abstract revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
}
