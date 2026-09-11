import { validate } from 'class-validator';
import { LoginSchema, RegisterSchema } from '@shedflow/shared';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

function toDto<T extends object>(cls: new () => T, data: object): T {
  return Object.assign(new cls(), data);
}

describe('auth DTO / zod contracts', () => {
  const valid = { email: 'ada@example.com', password: 'password123' };

  it('accepts the same valid register payload', async () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
    expect(await validate(toDto(RegisterDto, valid))).toHaveLength(0);
  });

  it('accepts optional register workspace fields', async () => {
    const withWorkspace = {
      ...valid,
      name: 'Ada',
      organizationName: 'Ada Labs',
      timezone: 'America/New_York',
    };
    expect(RegisterSchema.safeParse(withWorkspace).success).toBe(true);
    expect(await validate(toDto(RegisterDto, withWorkspace))).toHaveLength(0);
  });

  it('accepts the same valid login payload', async () => {
    expect(LoginSchema.safeParse(valid).success).toBe(true);
    expect(await validate(toDto(LoginDto, valid))).toHaveLength(0);
  });

  it('rejects a short password in both schemas', async () => {
    const invalid = { email: 'ada@example.com', password: 'short' };
    expect(RegisterSchema.safeParse(invalid).success).toBe(false);
    expect(LoginSchema.safeParse(invalid).success).toBe(false);
    expect(await validate(toDto(RegisterDto, invalid))).not.toHaveLength(0);
    expect(await validate(toDto(LoginDto, invalid))).not.toHaveLength(0);
  });
});
