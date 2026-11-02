import {
  IsIn,
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsDateString,
  IsObject,
} from 'class-validator';

export class IngestMessageDto {
  // channel is optional — the backend resolves the type from channel_id automatically
  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email', 'instagram', 'facebook', 'slack', 'webchat', 'voice'])
  channel?: string;

  @IsUUID()
  channel_id: string;

  // Auto-generated server-side if omitted; provide a stable value to enable deduplication on retries
  @IsOptional()
  @IsString()
  @MaxLength(500)
  channel_message_id?: string;

  // Defaults to "inbound" — always correct for messages coming from a visitor
  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: string;

  // Defaults to "user" — always correct for a real visitor
  @IsOptional()
  @IsIn(['user', 'agent', 'ai', 'system'])
  sender_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sender_identifier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sender_display_name?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  media_url?: string;

  @IsOptional()
  @IsDateString()
  sent_at?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
