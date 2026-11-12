import type { SupabaseClient } from '@supabase/supabase-js';
import { vi, type Mock } from 'vitest';
import { RealtimeClient } from '@/lib/realtime-client';

type Listener = { type: string; event?: string; callback: (arg: unknown) => void };

/** Minimal stand-in for a Supabase RealtimeChannel that tests can drive. */
export class FakeChannel {
  listeners: Listener[] = [];
  presence: Record<string, unknown[]> = {};
  state: 'closed' | 'errored' | 'joined' | 'joining' | 'leaving' = 'closed';
  subscribe: Mock<(callback?: (status: string) => void) => FakeChannel> = vi.fn((callback) => {
    this.state = 'joined';
    callback?.('SUBSCRIBED');
    return this;
  });
  unsubscribe: Mock<() => void> = vi.fn();
  send: Mock<(message: { type: string; event: string; payload: unknown }) => void> = vi.fn();
  track: Mock<(state: unknown) => Promise<string>> = vi.fn(async () => 'ok');
  untrack: Mock<() => Promise<string>> = vi.fn(async () => 'ok');

  constructor(public name: string) {}

  on(type: string, filter: { event?: string }, callback: (arg: unknown) => void) {
    if ((this.state === 'joined' || this.state === 'joining') && type === 'presence') {
      throw new Error(`cannot add \`${type}\` callbacks for realtime:${this.name} after \`subscribe()\`.`);
    }
    this.listeners.push({ type, event: filter.event, callback });
    return this;
  }

  presenceState() {
    return this.presence;
  }

  /** Delivers a broadcast event as Supabase would: `{ payload }`. */
  broadcast(event: string, payload: unknown) {
    this.emit('broadcast', event, { type: 'broadcast', event, payload });
  }

  emit(type: string, event: string, arg: unknown) {
    this.listeners.filter((l) => l.type === type && l.event === event).forEach((l) => l.callback(arg));
  }
}

export function createFakeRealtime() {
  const channels: FakeChannel[] = [];
  const supabase = {
    channel: vi.fn((name: string) => {
      const channel = new FakeChannel(name);
      channels.push(channel);
      return channel;
    }),
  };
  const client = new RealtimeClient(supabase as unknown as SupabaseClient);

  return {
    client,
    channels,
    /** Most recently created channel with this name. */
    channel(name: string) {
      const found = channels.filter((c) => c.name === name).at(-1);
      if (!found) throw new Error(`No realtime channel "${name}" was created`);
      return found;
    },
  };
}
