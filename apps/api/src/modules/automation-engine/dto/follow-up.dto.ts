import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const FOLLOW_UP_ACTIONS = ['send_message', 'send_email', 'notify_agent', 'create_task', 'call'] as const;
export const FOLLOW_UP_EXECUTORS = ['system', 'user'] as const;
export const CHANNEL_STRATEGIES = ['auto', 'same_channel', 'whatsapp_only', 'sms_only', 'email_only', 'voice_only'] as const;
export const FOLLOW_UP_STATUSES = ['pending', 'processing', 'awaiting_user', 'completed', 'cancelled', 'failed'] as const;

export class CreateFollowUpDto {
  @IsUUID()
  contact_id: string;

  @IsIn(FOLLOW_UP_ACTIONS)
  action: string;

  @ApiPropertyOptional({ description: 'When the step is due (ISO 8601)' })
  @IsISO8601({ strict: true })
  due_at: string;

  @ApiPropertyOptional({ description: 'A follow-up calendar; defaults to the organization one' })
  @IsOptional()
  @IsUUID()
  calendar_id?: string;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;

  @ApiPropertyOptional({ enum: FOLLOW_UP_EXECUTORS, description: "'user': a person does it when due" })
  @IsOptional()
  @IsIn(FOLLOW_UP_EXECUTORS)
  executor?: string;

  @IsOptional()
  @IsIn(CHANNEL_STRATEGIES)
  channel_strategy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message_content?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateFollowUpDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message_content?: string;

  @ApiPropertyOptional({ description: 'Move a step that has not run yet' })
  @IsOptional()
  @IsISO8601({ strict: true })
  due_at?: string;
}

export class CompleteFollowUpDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  channel?: string;
}

export class ListFollowUpsQueryDto {
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(FOLLOW_UP_ACTIONS)
  action?: string;

  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @IsOptional()
  @IsUUID()
  calendar_id?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class FollowUpMetricsQueryDto {
  @IsOptional()
  @IsUUID()
  calendar_id?: string;
}
