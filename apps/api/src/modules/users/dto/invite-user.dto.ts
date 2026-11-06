import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ASSIGNABLE_USER_ROLES, UserRole } from '@crm/shared';

export class InviteUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsIn(ASSIGNABLE_USER_ROLES)
  role: UserRole;
}
