import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsIn(['ONE_TIME', 'RECURRING'])
  type!: 'ONE_TIME' | 'RECURRING';

  @IsOptional()
  @IsInt()
  @Min(0)
  creditGrantPerPeriod?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditGrantPerPeriod?: number;
}

export class CreatePriceDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: 'month' | 'year';
}
