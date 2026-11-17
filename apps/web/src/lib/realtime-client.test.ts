import { describe, expect, it, vi } from 'vitest';
import { RealtimeClient } from './realtime-client';

function fakeSupabase() {
  const channel = vi.fn(() => ({ unsubscribe: vi.fn(), send: vi.fn() }));
  return { channel } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('RealtimeClient', () => {
  it('reuses the same channel object for the same name', () => {
    const client = new RealtimeClient(fakeSupabase());
    const a = client.getOrCreate('conversation:1');
    const b = client.getOrCreate('conversation:1');
    expect(a).toBe(b);
  });

  it('keeps a shared channel alive while any consumer still holds a reference', () => {
    const client = new RealtimeClient(fakeSupabase());
    const ch = client.getOrCreate('conversation:1'); // presence
    client.getOrCreate('conversation:1'); // typing

    client.unsubscribe('conversation:1'); // typing unmounts first
    expect(ch.unsubscribe).not.toHaveBeenCalled();

    client.unsubscribe('conversation:1'); // presence unmounts too
    expect(ch.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh channel after the last consumer releases it', () => {
    const client = new RealtimeClient(fakeSupabase());
    const first = client.getOrCreate('conversation:1');
    client.unsubscribe('conversation:1');

    const second = client.getOrCreate('conversation:1');
    expect(second).not.toBe(first);
  });

  it('broadcast does not take a reference, so it never keeps a channel alive on its own', () => {
    const client = new RealtimeClient(fakeSupabase());
    const ch = client.getOrCreate('conversation:1');
    client.broadcast('conversation:1', 'typing.started', { foo: 'bar' });

    client.unsubscribe('conversation:1');
    expect(ch.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribeAll tears every channel down regardless of ref counts', () => {
    const supabase = fakeSupabase();
    const client = new RealtimeClient(supabase);
    const a = client.getOrCreate('conversation:1');
    client.getOrCreate('conversation:1');
    const b = client.getOrCreate('conversation:2');

    client.unsubscribeAll();

    expect(a.unsubscribe).toHaveBeenCalledTimes(1);
    expect(b.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
