import {
  IsIn,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsObject,
} from 'class-validator';

/**
 * Flattened representation of a Retell webhook payload.
 *
 * Retell sends: { event, call: { call_id, agent_id, ... } }
 * The controller flattens call.* to top-level before validation.
 */
export class RetellWebhookDto {
  @IsIn(['call_started', 'call_ended', 'call_analyzed', 'transcript_updated'])
  event: string;

  @IsString()
  @IsNotEmpty()
  call_id: string;

  @IsOptional()
  @IsString()
  agent_id?: string;

  @IsOptional()
  @IsString()
  from_number?: string;

  @IsOptional()
  @IsString()
  to_number?: string;

  /**
   * Who placed the call. Decides which of the two numbers belongs to the
   * contact: on an outbound call `from_number` is our own Retell number.
   * Absent on older/manual payloads, which are treated as inbound.
   */
  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: 'inbound' | 'outbound';

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  disconnection_reason?: string;

  @IsOptional()
  @IsString()
  call_status?: string;

  @IsOptional()
  @IsObject()
  call_analysis?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  start_timestamp?: number;

  @IsOptional()
  @IsNumber()
  end_timestamp?: number;

  @IsOptional()
  @IsString()
  recording_url?: string;
}
