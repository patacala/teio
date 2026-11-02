export interface CommunicationTemplate {
  id: string;
  organization_id: string | null;
  event_type: string;
  channel_type: string;
  provider: string;
  provider_template_id: string;
  channel_id?: string | null;
  name?: string | null;
  description?: string | null;
  variables_schema?: Record<string, unknown>;
  from_override?: string | null;
  is_active: boolean;
  is_system?: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface CommunicationDelivery {
  id: string;
  organization_id: string;
  communication_template_id?: string | null;
  event_type: string;
  channel_type: string;
  provider: string;
  recipient: string;
  provider_template_id?: string | null;
  variables?: Record<string, unknown>;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  provider_message_id?: string | null;
  error_message?: string | null;
  delivered_at?: string | null;
  created_at: string;
}

export interface DispatchRequest {
  organizationId: string;
  eventType: string;
  channelType: string;
  recipient: string;
  subject?: string;
  variables?: Record<string, string>;
  attachments?: { filename: string; content: string; contentType?: string }[];
  fromOverride?: string;
}

export interface DispatchResult {
  dispatched: boolean;
  deliveryId?: string;
  error?: string;
}
