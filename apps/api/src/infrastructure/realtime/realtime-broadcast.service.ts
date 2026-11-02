import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type InAppNotificationType =
  | 'message'
  | 'voice'
  | 'appointment'
  | 'lead'
  | 'ai'
  | 'integration'
  | 'system';

export interface InAppNotificationPayload {
  id?: string;
  type: InAppNotificationType;
  title: string;
  description?: string;
  href?: string;
  conversationId?: string;
  contactId?: string;
  appointmentId?: string;
  actorUserId?: string;
}

@Injectable()
export class RealtimeBroadcastService {
  private readonly logger = new Logger(RealtimeBroadcastService.name);
  private readonly supabase: SupabaseClient | null;
  private readonly supabaseUrl: string;
  private readonly serviceKey: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL', '').replace(/\/$/, '');
    this.serviceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');
    this.supabase = this.supabaseUrl && this.serviceKey
      ? createClient(this.supabaseUrl, this.serviceKey)
      : null;
    if (!this.supabase) {
      this.logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — broadcasts disabled');
    }
  }

  notifyOrg(orgId: string, payload: InAppNotificationPayload): Promise<void> {
    return this.broadcastToOrg(orgId, 'notification.created', {
      id: payload.id ?? randomUUID(),
      type: payload.type,
      title: payload.title,
      description: payload.description,
      href: payload.href,
      conversationId: payload.conversationId,
      contactId: payload.contactId,
      appointmentId: payload.appointmentId,
      actorUserId: payload.actorUserId,
      createdAt: new Date().toISOString(),
    });
  }

  async broadcastToOrg(orgId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(`org:${orgId}`, event, payload);
  }

  async broadcastToConversation(conversationId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish(`conversation:${conversationId}`, event, payload);
  }

  private async publish(topic: string, event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.supabase) return;
    const viaHttp = await this.sendViaHttp(topic, event, payload);
    if (viaHttp) return;
    await this.sendViaSocket(topic, event, payload);
  }

  private async sendViaHttp(topic: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`${this.supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.serviceKey,
          Authorization: `Bearer ${this.serviceKey}`,
        },
        body: JSON.stringify({
          messages: [{ topic, event, payload }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Broadcast HTTP ${res.status} topic=${topic}: ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Broadcast HTTP failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async sendViaSocket(topic: string, event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.supabase) return;
    const channel = this.supabase.channel(topic, {
      config: { broadcast: { ack: true } },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('subscribe timeout')), 4000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timeout);
            reject(new Error(status));
          }
        });
      });
      const result = await channel.send({ type: 'broadcast', event, payload });
      if (result !== 'ok') {
        this.logger.warn(`Broadcast socket returned ${String(result)} topic=${topic}`);
      }
    } catch (err) {
      this.logger.warn(`Broadcast failed: ${(err as Error).message}`);
    } finally {
      await this.supabase.removeChannel(channel);
    }
  }
}
