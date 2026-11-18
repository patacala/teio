/**
 * What the AI agent receives today, per source event.
 *
 * Recorded from the legacy code paths (inbound message, payments, calls) into
 * `golden/ai-agent-jobs.json` as pairs of "event published" → "job enqueued
 * for the AI". After AI routing moves behind automations, the system AI
 * automations must turn the same published event into the same job.
 */

export interface PublishedEvent {
  topic: string;
  data: Record<string, unknown>;
}

export interface AgentJob {
  name: string;
  data: Record<string, unknown>;
  opts: Record<string, unknown>;
}

export interface AiJobRecord {
  /** Events the source published (RabbitMQ emit or outbox), in order. */
  events: PublishedEvent[];
  /** Jobs put on the agent_trigger queue, in order. Empty = the AI is not called. */
  jobs: AgentJob[];
}

export const AI_FIXTURE = {
  organizationId: '0a000000-0000-4000-8000-000000000001',
  contactId: 'c0000000-0000-4000-8000-000000000001',
  conversationId: 'cv000000-0000-4000-8000-000000000001',
  channelId: 'ch000000-0000-4000-8000-000000000001',
  messageId: 'm0000000-0000-4000-8000-000000000001',
  sentAt: '2026-03-20T14:05:00.000Z',
  paymentId: 'p0000000-0000-4000-8000-000000000001',
  appointmentId: 'a0000000-0000-4000-8000-000000000001',
  serviceId: 's0000000-0000-4000-8000-000000000001',
  callId: 'ca000000-0000-4000-8000-000000000009',
  externalCallId: 'retell_call_1',
};
