import { Repository } from '../common/persistence';
import { CreateUserData, UpdateUserData, User } from './user';

/**
 * Inherits the standard CRUD surface and adds only what is specific to users.
 * This class is the injection token; implementations live outside the module's
 * service layer.
 */
export abstract class UserRepository extends Repository<
  User,
  CreateUserData,
  UpdateUserData
> {
  /** @param email must already be normalised by `UsersService`. */
  abstract findByEmail(email: string): Promise<User | null>;
}
