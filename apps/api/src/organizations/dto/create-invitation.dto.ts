import { IsEmail, IsIn } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
