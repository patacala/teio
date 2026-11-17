import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageBubble } from './message-bubble';
import type { Message } from '@/services/conversations.service';

function outboundMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    content: 'Hello there',
    direction: 'outbound',
    sender_type: 'agent',
    type: 'text',
    channel: 'whatsapp',
    created_at: '2026-03-15T12:00:00Z',
    ...overrides,
  };
}

describe('MessageBubble — delivery failure', () => {
  it('shows nothing extra for a normally sent message', () => {
    render(<MessageBubble message={outboundMessage({ status: 'sent' })} />);
    expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
  });

  it('flags a failed outbound message with its reason', async () => {
    render(
      <MessageBubble
        message={outboundMessage({ status: 'failed', metadata: { failure_reason: 'Contact has no phone number' } })}
      />,
    );
    expect(screen.getByText('Not delivered')).toBeInTheDocument();
  });

  it('never flags an inbound message as undelivered', () => {
    render(<MessageBubble message={outboundMessage({ direction: 'inbound', status: 'failed' })} />);
    expect(screen.queryByText('Not delivered')).not.toBeInTheDocument();
  });
});
