import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CallRecordingPlayer } from './call-recording-player';

describe('CallRecordingPlayer', () => {
  it('renders the empty state when the call has no recording', () => {
    render(<CallRecordingPlayer recordingUrl={null} emptyState={<span>No recording available</span>} />);

    expect(screen.getByText('No recording available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play recording/i })).not.toBeInTheDocument();
  });

  it('loads the audio only when asked and returns to the play button when it ends', async () => {
    const user = userEvent.setup();
    const { container } = render(<CallRecordingPlayer recordingUrl="https://cdn.test/call-1.mp3" />);

    expect(container.querySelector('audio')).toBeNull();

    await user.click(screen.getByRole('button', { name: /play recording/i }));

    const audio = container.querySelector('audio')!;
    expect(audio).toHaveAttribute('autoplay');
    expect(audio.querySelector('source')).toHaveAttribute('src', 'https://cdn.test/call-1.mp3');
    expect(screen.queryByRole('button', { name: /play recording/i })).not.toBeInTheDocument();

    fireEvent.ended(audio);

    expect(container.querySelector('audio')).toBeNull();
    expect(screen.getByRole('button', { name: /play recording/i })).toBeInTheDocument();
  });
});
