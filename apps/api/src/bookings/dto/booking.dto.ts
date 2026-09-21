import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BookingSource } from '@shedflow/db';

class InviteeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreatePublicBookingDto {
  @IsString()
  @MinLength(1)
  orgSlug!: string;

  @IsString()
  @MinLength(1)
  eventTypeSlug!: string;

  @IsString()
  startAt!: string;

  @IsString()
  timezone!: string;

  @ValidateNested()
  @Type(() => InviteeDto)
  invitee!: InviteeDto;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string | boolean>;

  @IsEnum(BookingSource)
  source!: BookingSource;
}

export class CreateHostBookingDto {
  @IsUUID()
  eventTypeId!: string;

  @IsString()
  startAt!: string;

  @IsString()
  timezone!: string;

  @ValidateNested()
  @Type(() => InviteeDto)
  invitee!: InviteeDto;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string | boolean>;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RescheduleBookingDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsString()
  startAt!: string;

  @IsString()
  timezone!: string;
}
