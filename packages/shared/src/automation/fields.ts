/**
 * Field and variable vocabulary shared by the automation engine (validation,
 * conditions, rendering) and the builder UI (pickers, previews).
 */

export type AutomationFieldType = 'string' | 'text' | 'number' | 'boolean' | 'enum' | 'date' | 'tags';

/** Org data the UI offers as choices for a field (loaded from the catalog endpoint). */
export type AutomationFieldPicker = 'channel' | 'stage' | 'calendar' | 'service' | 'tag' | 'user' | 'sender_type';

export interface AutomationFieldOption {
  value: string;
  label: string;
}

export interface AutomationFieldDef {
  /** Dotted path, e.g. `trigger.channel`, `contact.tags`, `contact.custom.budget`. */
  path: string;
  label: string;
  type: AutomationFieldType;
  options?: AutomationFieldOption[];
  picker?: AutomationFieldPicker;
}

/** Groups of `{{variables}}` a run can render, depending on its trigger. */
export type VariableGroup =
  | 'contact'
  | 'organization'
  | 'conversation'
  | 'message'
  | 'appointment'
  | 'payment'
  | 'call';

export interface VariableDef {
  /** Used as `{{path}}` in message content. */
  path: string;
  label: string;
  example: string;
}

export const CHANNEL_OPTIONS: AutomationFieldOption[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook Messenger' },
  { value: 'sms', label: 'SMS' },
  { value: 'webchat', label: 'Web chat' },
  { value: 'email', label: 'Email' },
  { value: 'voice', label: 'Voice' },
];

/** Who produced an outbound message. */
export const SENDER_TYPE_OPTIONS: AutomationFieldOption[] = [
  { value: 'ai', label: 'AI agent' },
  { value: 'agent', label: 'Team member' },
  { value: 'api', label: 'API integration' },
  { value: 'automation', label: 'Automation' },
  { value: 'system', label: 'System' },
];

export const VARIABLES: Record<VariableGroup, VariableDef[]> = {
  contact: [
    { path: 'contact.first_name', label: 'First name', example: 'Ana' },
    { path: 'contact.last_name', label: 'Last name', example: 'García' },
    { path: 'contact.full_name', label: 'Full name', example: 'Ana García' },
    { path: 'contact.email', label: 'Email', example: 'ana@example.com' },
    { path: 'contact.phone', label: 'Phone', example: '+15550001234' },
    { path: 'contact.lead_score', label: 'Lead score', example: '60' },
  ],
  organization: [{ path: 'organization.name', label: 'Organization name', example: 'Clínica Sol' }],
  conversation: [{ path: 'conversation.channel', label: 'Conversation channel', example: 'whatsapp' }],
  message: [
    { path: 'message.content', label: 'Message text', example: 'Hi, do you have availability tomorrow?' },
    { path: 'message.channel', label: 'Message channel', example: 'whatsapp' },
  ],
  appointment: [
    { path: 'appointment.title', label: 'Appointment title', example: 'Initial consultation' },
    { path: 'appointment.date', label: 'Date', example: 'Monday, March 23, 2026' },
    { path: 'appointment.time', label: 'Start time', example: '09:00 AM' },
    { path: 'appointment.end_time', label: 'End time', example: '09:30 AM' },
    { path: 'appointment.timezone', label: 'Time zone', example: 'America/Mexico_City' },
    { path: 'appointment.location', label: 'Location', example: 'Main office' },
    { path: 'appointment.meeting_url', label: 'Meeting link', example: 'https://meet.example.com/abc' },
    { path: 'appointment.confirm_url', label: 'Confirm link (email)', example: 'https://…/confirm' },
    { path: 'appointment.confirm_url_sms', label: 'Confirm link (short, SMS)', example: 'https://…/c/abc' },
    { path: 'appointment.manage_url', label: 'Reschedule/cancel link (email)', example: 'https://…/manage' },
    { path: 'appointment.manage_url_sms', label: 'Reschedule/cancel link (short, SMS)', example: 'https://…/m/abc' },
  ],
  payment: [
    { path: 'payment.amount', label: 'Amount', example: '50.00 USD' },
    { path: 'payment.service_name', label: 'Service', example: 'Initial consultation' },
    { path: 'payment.message', label: 'Payment summary', example: 'Payment confirmed (Initial consultation) (50.00 USD).' },
  ],
  call: [
    { path: 'call.summary', label: 'Call summary', example: 'The customer asked to book next week.' },
    { path: 'call.duration_seconds', label: 'Call duration (seconds)', example: '184' },
  ],
};

/**
 * Contact fields available to conditions and recipient filters, whatever the
 * trigger. `contact.custom.<key>` is also accepted for any captured field.
 */
export const CONTACT_FIELDS: AutomationFieldDef[] = [
  { path: 'contact.first_name', label: 'First name', type: 'string' },
  { path: 'contact.last_name', label: 'Last name', type: 'string' },
  { path: 'contact.email', label: 'Email', type: 'string' },
  { path: 'contact.phone', label: 'Phone', type: 'string' },
  { path: 'contact.tags', label: 'Tags', type: 'tags', picker: 'tag' },
  { path: 'contact.stage', label: 'Funnel stage', type: 'enum', picker: 'stage' },
  { path: 'contact.lead_score', label: 'Lead score', type: 'number' },
  {
    path: 'contact.handled_by',
    label: 'Handled by',
    type: 'enum',
    options: [
      { value: 'ai', label: 'AI' },
      { value: 'human', label: 'Team' },
    ],
  },
  { path: 'contact.assigned_to', label: 'Assigned to', type: 'enum', picker: 'user' },
  { path: 'contact.channels', label: 'Reachable on channel', type: 'enum', options: CHANNEL_OPTIONS },
  { path: 'contact.created_at', label: 'Created', type: 'date' },
  { path: 'contact.last_contacted_at', label: 'Last contacted', type: 'date' },
];

/** Conversation fields, available when the run has a conversation. */
export const CONVERSATION_FIELDS: AutomationFieldDef[] = [
  { path: 'conversation.channel', label: 'Channel', type: 'enum', options: CHANNEL_OPTIONS },
  { path: 'conversation.ai_active', label: 'AI answering this conversation', type: 'boolean' },
  {
    path: 'conversation.status',
    label: 'Conversation status',
    type: 'enum',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'pending', label: 'Pending' },
      { value: 'resolved', label: 'Resolved' },
    ],
  },
];
