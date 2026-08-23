import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';
import { PublicUser } from '../users/user';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{
    accessToken: string;
    user: PublicUser;
  }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create(dto.email, passwordHash);

    return {
      accessToken: await this.signToken(user.id, user.email),
      user: this.usersService.toPublic(user),
    };
  }

  async login(user: PublicUser): Promise<{
    accessToken: string;
    user: PublicUser;
  }> {
    return {
      accessToken: await this.signToken(user.id, user.email),
      user,
    };
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<PublicUser | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return null;
    }

    return this.usersService.toPublic(user);
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.usersService.toPublic(user);
  }

  private signToken(userId: string, email: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwtService.signAsync(payload);
  }
}
