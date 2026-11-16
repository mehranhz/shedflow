import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CustomerRegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CustomerLoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CustomerClaimDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone!: string;
}

export class CustomerClaimConfirmDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
