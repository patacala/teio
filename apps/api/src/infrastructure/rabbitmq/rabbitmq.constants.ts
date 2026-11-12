export const RABBITMQ_EXCHANGES = {
  CONVERSATIONS: 'conversations',
  AI_AGENTS: 'ai-agents',
  WEBHOOKS: 'webhooks',
  NOTIFICATIONS: 'notifications',
} as const;

export const RABBITMQ_QUEUES = {
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SEND: 'message.send',
  CONVERSATION_ASSIGN: 'conversation.assign',
  AI_PROCESS: 'ai.process',
  WEBHOOK_DELIVER: 'webhook.deliver',
  NOTIFICATION_SEND: 'notification.send',
  // Voice call events
  CALL_OUTBOUND_REQUESTED: 'call.outbound.requested',
  CALL_STARTED: 'call.started',
  CALL_COMPLETED: 'call.completed',
  CALL_TRANSCRIPT_UPDATED: 'call.transcript.updated',
  // AI Automation events
  AGENT_TRIGGERED: 'agent.triggered',
  AGENT_TOOL_EXECUTED: 'agent.tool.executed',
  // Contact events
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_STAGE_CHANGED: 'contact.stage.changed',
  // Fired when a contact's captured/custom fields change — carries the BANT
  // qualification signals the funnel evaluates.
  CONTACT_DATA_CAPTURED: 'contact.data.captured',
  // Scheduling events
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_CONFIRMED: 'appointment.confirmed',
  // Notification command: ask the contact to confirm (initial, reminder or after a reschedule).
  APPOINTMENT_CONFIRMATION_REQUESTED: 'appointment.confirmation.requested',
  APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_COMPLETED: 'appointment.completed',
  APPOINTMENT_NO_SHOW: 'appointment.no_show',
  APPOINTMENT_UPDATED: 'appointment.updated',
  // An unpaid hold expired and its slot was released.
  APPOINTMENT_HOLD_RELEASED: 'appointment.hold_released',
  // A reminder of an upcoming booking is due (sent to the contact).
  APPOINTMENT_REMINDER_DUE: 'appointment.reminder.due',
  // Funnel automation events
  SEQUENCE_EXHAUSTED: 'sequence.exhausted',
  // Conversation lifecycle
  CONVERSATION_CLOSED: 'conversation.closed',
  // Billing events
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_PAYMENT_FAILED: 'invoice.payment.failed',
  USAGE_LIMIT_REACHED: 'usage.limit.reached',
  // Follow-up automation events
  FOLLOW_UP_COMPLETED: 'followup.completed',
  FOLLOW_UP_FAILED: 'followup.failed',
  // Payment events (per-org Stripe collections, distinct from SaaS billing above)
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_EXPIRED: 'payment.expired',
  // Dead-letter queues
  DLQ_MESSAGE: 'dlq.message',
  DLQ_AI: 'dlq.ai',
  DLQ_WEBHOOK: 'dlq.webhook',
} as const;

export const RABBITMQ_SERVICE = 'RABBITMQ_SERVICE';
