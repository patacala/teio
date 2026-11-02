import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  stripe_secret_key?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  stripe_webhook_secret?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
