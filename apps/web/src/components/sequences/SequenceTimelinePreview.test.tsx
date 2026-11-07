import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SequenceTimelinePreview } from './SequenceTimelinePreview';

describe('SequenceTimelinePreview', () => {
  it('shows each step with its own delay and the running total', () => {
    render(
      <SequenceTimelinePreview
        steps={[
          { action: 'send_message', channel_strategy: 'auto', delay_hours: 2 },
          { action: 'call', channel_strategy: 'voice_only', delay_hours: 22 },
          { action: 'send_email', channel_strategy: 'email_only', delay_hours: 36 },
        ]}
      />,
    );

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Message· Automatic+2 h · cumulative 2 h',
      'Call· Call only+22 h · cumulative 1 day',
      'Email· Email only+2 days · cumulative 3 days',
    ]);
  });

  it('falls back gracefully for unknown actions and channel strategies', () => {
    render(<SequenceTimelinePreview steps={[{ action: 'legacy_action', channel_strategy: 'telegram_only', delay_hours: 1 }]} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('Message· telegram_only+1 h · cumulative 1 h');
  });
});
