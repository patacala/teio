import type { BaseTenantEntity } from './tenant.types';

export type ChannelType =
  | 'whatsapp'
  | 'sms'
  | 'email'
  | 'instagram'
  | 'facebook'
  | 'slack'
  | 'webchat'
  | 'voice';

export type ConversationStatus =
  | 'open'
  | 'pending'
  | 'resolved'
  | 'archived'
  | 'snoozed';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'location'
  | 'template'
  | 'interactive'
  | 'system';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface Conversation extends BaseTenantEntity {
  channel: ChannelType;
  status: ConversationStatus;
  contact_id: string;
  assigned_agent_id?: string;
  ai_agent_id?: string;
  subject?: string;
  last_message_at?: Date;
  resolved_at?: Date;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface Message extends BaseTenantEntity {
  conversation_id: string;
  content: string;
  type: MessageType;
  direction: MessageDirection;
  status: MessageStatus;
  sender_id?: string;
  external_id?: string;
  media_url?: string;
  metadata: Record<string, unknown>;
  sent_at: Date;
  channel: string;
  channel_message_id?: string;
  sender_type: string;
}

export interface ConversationEvent {
  event: string;
  conversation_id: string;
  organization_id: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}
