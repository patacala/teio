import { IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class UpdateProsalesIntegrationDto {
  @IsOptional()
  @IsUrl({ require_tld: false }) // allow http://localhost / internal hostnames in dev
  base_url?: string;

  @IsOptional()
  @IsString()
  api_key?: string;

  @IsOptional()
  @IsUUID()
  agent_version_id?: string;
}
