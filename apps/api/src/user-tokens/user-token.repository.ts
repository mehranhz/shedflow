import { Repository } from '../common/persistence';
import {
  CreateUserTokenData,
  UpdateUserTokenData,
  UserToken,
} from './user-token';

export abstract class UserTokenRepository extends Repository<
  UserToken,
  CreateUserTokenData,
  UpdateUserTokenData
> {
  abstract findByTokenHash(tokenHash: string): Promise<UserToken | null>;
}
