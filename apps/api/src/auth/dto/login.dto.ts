import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  /** Phone sign-in. `username` is the same value, kept for the staff form. */
  @ValidateIf((dto: LoginDto) => !dto.phone)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username?: string;

  @ValidateIf((dto: LoginDto) => !dto.username)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;
}
