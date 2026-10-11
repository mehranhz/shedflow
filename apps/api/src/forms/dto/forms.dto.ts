import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class FormFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsIn(['text', 'textarea', 'checkbox', 'signature', 'file', 'waiver'])
  type!: 'text' | 'textarea' | 'checkbox' | 'signature' | 'file' | 'waiver';

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateFormTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  schema!: FormFieldDto[];

  @IsOptional()
  @IsBoolean()
  requiredBeforeConfirm?: boolean;
}

export class UpdateFormTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  schema?: FormFieldDto[];

  @IsOptional()
  @IsBoolean()
  requiredBeforeConfirm?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AttachFormTemplateDto {
  @IsUUID()
  formTemplateId!: string;

  @IsOptional()
  @IsBoolean()
  requiredBeforeConfirm?: boolean;
}

export class SubmitFormDto {
  @IsObject()
  answers!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signatureName?: string;

  @IsOptional()
  @IsBoolean()
  waiverAccepted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bookingUid?: string;
}

export class RequestUploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  fieldKey!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number)
  sizeBytes!: number;
}
