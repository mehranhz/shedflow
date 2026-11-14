import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username!: string;
}

export class VerifyOtpDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;
}
