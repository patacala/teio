import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveCall } from '@/types/realtime.types';
import { ActiveCallIndicator } from './active-call-indicator';

const realtime = vi.hoisted(() => ({ activeCalls: new Map<string, ActiveCall>() }));

vi.mock('@/providers/realtime-provider', () => ({
  useRealtime: () => ({ client: {}, activeCalls: realtime.activeCalls }),
}));

function call(callId: string, callerName?: string): ActiveCall {
  return { callId, conversationId: 'conv-1', startedAt: '2026-03-15T12:00:00Z', callerName, channel: 'voice' };
}

function setCall(active: ActiveCall | null) {
  realtime.activeCalls = active ? new Map([['conv-1', active]]) : new Map();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  setCall(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ActiveCallIndicator', () => {
  it('shows nothing while there is no call on the conversation', () => {
    render(<ActiveCallIndicator conversationId="conv-1" />);

    expect(screen.queryByText(/active call/i)).not.toBeInTheDocument();
  });

  it('follows a call from start to finish with a running timer', async () => {
    const { rerender } = render(<ActiveCallIndicator conversationId="conv-1" />);

    setCall(call('call-1', 'Ana Pérez'));
    rerender(<ActiveCallIndicator conversationId="conv-1" />);

    expect(screen.getByText('Active call · Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('00:00')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByText('01:05')).toBeInTheDocument();

    setCall(null);
    rerender(<ActiveCallIndicator conversationId="conv-1" />);

    await waitFor(() => expect(screen.queryByText(/active call/i)).not.toBeInTheDocument());
  });

  it('restarts the timer for the next call', async () => {
    setCall(call('call-1'));
    const { rerender } = render(<ActiveCallIndicator conversationId="conv-1" />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('00:30')).toBeInTheDocument();

    setCall(null);
    rerender(<ActiveCallIndicator conversationId="conv-1" />);
    await waitFor(() => expect(screen.queryByText(/active call/i)).not.toBeInTheDocument());

    setCall(call('call-2'));
    rerender(<ActiveCallIndicator conversationId="conv-1" />);

    expect(screen.getByText('Active call')).toBeInTheDocument();
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('ignores calls on other conversations', () => {
    realtime.activeCalls = new Map([['conv-2', { ...call('call-9'), conversationId: 'conv-2' }]]);

    render(<ActiveCallIndicator conversationId="conv-1" />);

    expect(screen.queryByText(/active call/i)).not.toBeInTheDocument();
  });
});
