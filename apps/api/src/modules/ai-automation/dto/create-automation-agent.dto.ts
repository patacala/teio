import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';
import { StrictBoolean } from '../../../common/decorators/strict-boolean.decorator';

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
  @StrictBoolean()
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
  @StrictBoolean()
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
