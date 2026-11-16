import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { PublicUser } from '../../users/user';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'username' });
  }

  async validate(phone: string, password: string): Promise<PublicUser> {
    const user = await this.authService.validateUser(phone, password);
    if (!user) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    return user;
  }
}
