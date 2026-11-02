import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logo_url?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primary_color must be a valid hex color (e.g. #2563EB)' })
  primary_color?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent_color must be a valid hex color (e.g. #10B981)' })
  accent_color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  from_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  from_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  support_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  website_url?: string;
}
