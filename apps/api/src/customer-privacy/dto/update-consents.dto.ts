import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConsentsDto {
  @IsOptional()
  @IsBoolean()
  marketingPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingOffers?: boolean;
}
