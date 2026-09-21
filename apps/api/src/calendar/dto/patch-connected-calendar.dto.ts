import { IsBoolean, IsOptional } from 'class-validator';

export class PatchConnectedCalendarDto {
  @IsOptional()
  @IsBoolean()
  conflictCheck?: boolean;

  @IsOptional()
  @IsBoolean()
  writeTarget?: boolean;
}
