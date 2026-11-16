import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  /** Phone number. Staff sign-up sends this as `username`. */
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username!: string;

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
