import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CustomerRegisterDto {
  @IsEmail()
  email!: string;

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
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CustomerClaimDto {
  @IsEmail()
  email!: string;
}

export class CustomerClaimConfirmDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
