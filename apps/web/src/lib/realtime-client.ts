import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export class RealtimeClient {
  private supabase: SupabaseClient;
  private channels = new Map<string, RealtimeChannel>();
  // Several hooks (presence, typing, streaming messages) share one channel
  // per conversation. Without counting references, whichever hook unmounts
  // first tears the channel down for every other hook still using it.
  private refCounts = new Map<string, number>();

  constructor(client: SupabaseClient) {
    this.supabase = client;
  }

  getOrCreate(name: string): RealtimeChannel {
    this.refCounts.set(name, (this.refCounts.get(name) ?? 0) + 1);
    if (this.channels.has(name)) return this.channels.get(name)!;
    const ch = this.supabase.channel(name);
    this.channels.set(name, ch);
    return ch;
  }

  /** Releases this caller's reference; only tears the channel down once nobody else holds one. */
  unsubscribe(name: string) {
    const remaining = (this.refCounts.get(name) ?? 1) - 1;
    if (remaining > 0) {
      this.refCounts.set(name, remaining);
      return;
    }
    this.refCounts.delete(name);
    const ch = this.channels.get(name);
    if (ch) {
      ch.unsubscribe();
      this.channels.delete(name);
    }
  }

  /** Sends on an existing channel without taking a reference on it — a broadcast isn't a subscription. */
  broadcast(name: string, event: string, payload: unknown) {
    const ch = this.channels.get(name) ?? this.supabase.channel(name);
    if (!this.channels.has(name)) this.channels.set(name, ch);
    ch.send({ type: 'broadcast', event, payload });
  }

  unsubscribeAll() {
    this.channels.forEach((ch) => ch.unsubscribe());
    this.channels.clear();
    this.refCounts.clear();
  }
}
