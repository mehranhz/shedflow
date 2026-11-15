import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCustomerBookingDto {
  @IsString()
  @MinLength(1)
  eventTypeSlug!: string;

  @IsString()
  @MinLength(1)
  startAt!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string | boolean>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  occurrences?: number;
}

export class CancelCustomerBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(['single', 'this_and_future'])
  scope?: 'single' | 'this_and_future';
}

export class RescheduleCustomerBookingDto {
  @IsString()
  @MinLength(1)
  startAt!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;
}

export class CustomerNoteDto {
  @IsString()
  @MaxLength(2000)
  customerNote!: string;
}

export class CustomerAttachmentDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
