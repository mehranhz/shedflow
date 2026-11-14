import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  /** Email registration. Omit when `username` (phone) is sent. */
  @ValidateIf((dto: RegisterDto) => !dto.username)
  @IsEmail()
  email?: string;

  /** Phone registration used by the staff sign-up form. */
  @ValidateIf((dto: RegisterDto) => !dto.email)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  organizationName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;
}
