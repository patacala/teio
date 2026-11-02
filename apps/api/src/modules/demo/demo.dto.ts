import { IsEmail, IsEnum, IsOptional, IsString, IsUrl, IsUUID, MinLength } from 'class-validator';
import { DemoType, DemoRequestStatus } from '@crm/shared';

export class SubmitDemoDto {
  @IsString()
  @MinLength(1)
  first_name: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @MinLength(1)
  company_name: string;

  @IsUrl()
  @IsOptional()
  website?: string;

  @IsEnum(DemoType)
  demo_type: DemoType;
}

export class DemoReadyDto {
  @IsUUID()
  request_id: string;

  @IsString()
  webhook_token: string;

  @IsEnum(DemoRequestStatus)
  status: DemoRequestStatus.READY | DemoRequestStatus.FAILED;

  @IsString()
  @IsOptional()
  error_message?: string;
}

export class SendDemoEmailDto {
  @IsEmail()
  @IsOptional()
  email?: string;
}

export class DemoRequestListParams {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
