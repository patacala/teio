import type { BaseTenantEntity } from './tenant.types';

export type CallStatus = 'initiated' | 'in_progress' | 'completed' | 'failed';
export type TranscriptSpeaker = 'user' | 'ai' | 'system';

export interface Call extends BaseTenantEntity {
  contact_id: string | null;
  conversation_id: string | null;
  channel: string;
  provider: string;
  external_call_id: string;
  phone_from: string;
  phone_to: string;
  status: CallStatus;
  duration_seconds: number | null;
  started_at: Date | null;
  ended_at: Date | null;
}

export interface CallEvent extends BaseTenantEntity {
  call_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

export interface TranscriptSegment {
  speaker: TranscriptSpeaker;
  content: string;
  timestamp_seconds?: number;
}

export interface CallCompletedEvent {
  organization_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  call: {
    id: string;
    external_call_id: string;
    phone_from: string;
    phone_to: string;
    duration_seconds: number | null;
    started_at: Date | null;
    ended_at: Date | null;
    summary?: string;
  };
}
