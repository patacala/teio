import { IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { StrictBoolean } from '../../../common/decorators/strict-boolean.decorator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase letters, numbers and dashes' })
  @MaxLength(100)
  slug: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateSequenceSettingsDto {
  @StrictBoolean()
  enabled: boolean;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @StrictBoolean()
  is_active?: boolean;

  /** Our own organization: left out of the platform dashboard metrics. */
  @IsOptional()
  @StrictBoolean()
  is_internal?: boolean;
}
