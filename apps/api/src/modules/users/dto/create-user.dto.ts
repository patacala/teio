import { IsEmail, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ASSIGNABLE_USER_ROLES, UserRole } from '@crm/shared';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_name: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
