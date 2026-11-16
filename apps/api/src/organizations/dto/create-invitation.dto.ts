import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInvitationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone!: string;

  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
