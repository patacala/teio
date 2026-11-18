import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { createQueryWrapper } from '@/test/query';
import { AiRepliesCard } from './AiRepliesCard';

function incoming(status: 'active' | 'paused') {
  return { id: 'a-ai', name: 'AI agent: answer incoming messages', status, category: 'ai', template_key: 'ai_incoming_message', trigger_keys: ['message.received'] };
}

function renderCard() {
  const { wrapper } = createQueryWrapper();
  render(<AiRepliesCard />, { wrapper });
}

describe('AiRepliesCard', () => {
  it('says the agent answers while the incoming-message automation is active, and links to it', async () => {
    mockApi('get', '/automations', { data: [incoming('active')] });
    renderCard();

    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the incoming-message automation' })).toHaveAttribute('href', '/config/automations/a-ai');
  });

  it('warns that the agent does not answer while it is paused', async () => {
    mockApi('get', '/automations', { data: [incoming('paused')] });
    renderCard();

    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.getByText(/the agent does not answer new messages/)).toBeInTheDocument();
  });
});
