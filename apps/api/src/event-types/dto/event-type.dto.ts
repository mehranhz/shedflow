import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LocationType } from '@shedflow/db';

/** Skip UUID checks for omitted / null / empty optional ids. */
function isPresentUuid(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

class QuestionDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  type!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class CreateEventTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes!: number;

  @IsEnum(LocationType)
  locationType!: LocationType;

  @IsOptional()
  @IsString()
  locationValue?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  scheduleId?: string;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  hostUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferBeforeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minNoticeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDaysAhead?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  slotIntervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyCap?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationNoticeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rescheduleNoticeHours?: number;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  priceId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  subscriptionProductId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditCost?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}

export class UpdateEventTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @IsOptional()
  @IsString()
  locationValue?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  scheduleId?: string;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  hostUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferBeforeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minNoticeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDaysAhead?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  slotIntervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyCap?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationNoticeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rescheduleNoticeHours?: number;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  priceId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => isPresentUuid(value))
  @IsUUID()
  subscriptionProductId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditCost?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}
