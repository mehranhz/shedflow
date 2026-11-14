import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  /** Email login used by the original Nest contract. */
  @ValidateIf((dto: LoginDto) => !dto.username)
  @IsEmail()
  email?: string;

  /** Phone login used by the staff sign-in form. */
  @ValidateIf((dto: LoginDto) => !dto.email)
  @IsString()
  @MinLength(3)
  username?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
