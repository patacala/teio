import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ASSIGNABLE_USER_ROLES, UserRole } from '@crm/shared';
import { StrictBoolean } from '../../../common/decorators/strict-boolean.decorator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_name?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @StrictBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
