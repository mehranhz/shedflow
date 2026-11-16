import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConsentsDto {
  @IsOptional()
  @IsBoolean()
  marketingEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingOffers?: boolean;
}
