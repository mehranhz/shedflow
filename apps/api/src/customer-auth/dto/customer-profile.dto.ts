import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class BusinessProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsString()
  @MinLength(4)
  updatedAt!: string;
}

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2048)
  photoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsString()
  @MinLength(4)
  updatedAt!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessProfileDto)
  business?: BusinessProfileDto;
}

export class RequestEmailChangeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  updatedAt!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
