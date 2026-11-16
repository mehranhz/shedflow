import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;

  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  totpCode?: string;
}

export class ConfirmTotpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class DisableTotpDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

export class MfaLoginDto {
  @IsString()
  @MinLength(20)
  mfaToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

export class RevokeSessionsDto {
  @IsOptional()
  @IsBoolean()
  keepCurrent?: boolean;
}
