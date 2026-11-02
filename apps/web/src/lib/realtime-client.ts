import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export class RealtimeClient {
  private supabase: SupabaseClient;
  private channels = new Map<string, RealtimeChannel>();

  constructor(client: SupabaseClient) {
    this.supabase = client;
  }

  getOrCreate(name: string): RealtimeChannel {
    if (this.channels.has(name)) return this.channels.get(name)!;
    const ch = this.supabase.channel(name);
    this.channels.set(name, ch);
    return ch;
  }

  unsubscribe(name: string) {
    const ch = this.channels.get(name);
    if (ch) {
      ch.unsubscribe();
      this.channels.delete(name);
    }
  }

  broadcast(name: string, event: string, payload: unknown) {
    this.getOrCreate(name).send({ type: 'broadcast', event, payload });
  }

  unsubscribeAll() {
    this.channels.forEach((ch) => ch.unsubscribe());
    this.channels.clear();
  }
}
