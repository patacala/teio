import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { StrictBoolean } from '../../../common/decorators/strict-boolean.decorator';

export class CreatePaymentServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Cents */
  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @StrictBoolean()
  is_active?: boolean;
}

export class UpdatePaymentServiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @StrictBoolean()
  is_active?: boolean;
}
