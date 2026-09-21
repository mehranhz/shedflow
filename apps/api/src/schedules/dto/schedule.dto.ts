import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;

  @IsOptional()
  @IsUUID()
  hostUserId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AvailabilityRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute!: number;
}

export class ReplaceRulesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules!: AvailabilityRuleDto[];
}

export class UpsertOverrideDto {
  @IsBoolean()
  isUnavailable!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute?: number | null;
}
