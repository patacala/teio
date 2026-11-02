export interface IncomingMessagePayload {
  channel: string;
  channel_id: string;
  channel_message_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'user' | 'agent' | 'ai' | 'system';
  sender_identifier?: string;
  sender_display_name?: string;
  content: string;
  type?: string;
  media_url?: string;
  sent_at?: Date;
  metadata?: Record<string, unknown>;
}

export interface MessageReceivedEvent {
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  channel: string;
  message: {
    id: string;
    content: string;
    direction: 'inbound' | 'outbound';
    sender_type: 'user' | 'agent' | 'ai' | 'system';
    channel_message_id: string;
    metadata: Record<string, unknown>;
    sent_at: Date;
  };
}
