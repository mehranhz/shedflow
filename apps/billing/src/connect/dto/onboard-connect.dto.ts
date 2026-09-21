import { IsIn, IsOptional, IsString } from 'class-validator';
import { CONNECT_COUNTRIES } from '../connect.constants';

export class OnboardConnectDto {
  @IsOptional()
  @IsString()
  @IsIn([...CONNECT_COUNTRIES])
  country?: string;
}
