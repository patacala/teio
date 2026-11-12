import {
  IsIn,
  MaxLength,
  IsUUID,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentResolution } from '@crm/shared';

/** Slot the contact accepted. CRM holds it on the payment and creates the appointment only after Stripe pays. */
export class PaymentBookingDto {
  /** Optional when the service is linked to exactly one appointments calendar. */
  @IsOptional()
  @IsUUID()
  calendar_id?: string;

  @IsOptional()
  @IsString()
  title?: string;

  /** ISO datetime; validated/normalized in PaymentsService. */
  @IsString()
  @IsNotEmpty()
  starts_at: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  duration_minutes: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreatePaymentDto {
  @IsUUID()
  contact_id: string;

  @IsUUID()
  service_id: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  /** Legacy: confirm an already-created appointment. Prefer `booking` instead. */
  @IsOptional()
  @IsUUID()
  appointment_id?: string;

  /** Draft appointment — created as `confirmed` only after Stripe pays. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentBookingDto)
  booking?: PaymentBookingDto;
}

export class ResolvePaymentDto {
  @IsIn(Object.values(PaymentResolution))
  resolution: PaymentResolution;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Required for `rebooked`: the appointment the payment now covers. */
  @IsOptional()
  @IsUUID()
  appointment_id?: string;
}
