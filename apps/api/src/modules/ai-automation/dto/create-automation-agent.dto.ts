import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUrl } from 'class-validator';

export class CreateAutomationAgentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  trigger_event: string;

  @IsUrl()
  workflow_endpoint: string;

  @IsOptional()
  @IsString()
  auth_header_value?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateAutomationAgentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  trigger_event?: string;

  @IsOptional()
  @IsUrl()
  workflow_endpoint?: string;

  @IsOptional()
  @IsString()
  auth_header_value?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateAgentToolDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;
}
