import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { API_KEY_SCOPES } from '@shedflow/shared';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn([...API_KEY_SCOPES], { each: true })
  scopes!: string[];
}
