import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { ContactEntity } from '../client-management/contact.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ChannelsService } from '../integrations/channels.service';

export interface ResolvedChannel {
  channel: string;
  recipientId: string;
}

const DEFAULT_CHANNEL_PRIORITY = ['whatsapp', 'sms', 'email'];

@Injectable()
export class ChannelStrategyResolverService {
  private readonly logger = new Logger(ChannelStrategyResolverService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly channelsService: ChannelsService,
  ) {}

  async resolve(
    contact: ContactEntity,
    organizationId: string,
    strategy: string,
    metadata?: Record<string, unknown>,
  ): Promise<ResolvedChannel | null> {
    const resolved = await this.resolveStrategy(contact, organizationId, strategy, metadata);
    if (resolved) return resolved;

    // A specific strategy that cannot be satisfied (e.g. `email_only` on a
    // contact with no email) must not drop the touch — fall back to `auto`,
    // which prefers the channel the contact last wrote on, then the org default.
    if (strategy !== 'auto' && strategy !== 'same_channel') {
      this.logger.warn(
        `Strategy '${strategy}' unresolvable for contact ${contact.id} — falling back to auto`,
      );
      return this.resolveAuto(contact, organizationId);
    }
    return null;
  }

  private async resolveStrategy(
    contact: ContactEntity,
    organizationId: string,
    strategy: string,
    metadata?: Record<string, unknown>,
  ): Promise<ResolvedChannel | null> {
    switch (strategy) {
      case 'auto':
        return this.resolveAuto(contact, organizationId);
      case 'same_channel':
        return this.resolveSameChannel(contact, organizationId, metadata);
      case 'whatsapp_only':
        return this.resolveSpecific(contact, organizationId, 'whatsapp');
      case 'sms_only':
        return this.resolveSpecific(contact, organizationId, 'sms');
      case 'voice_only':
        return this.resolveVoice(contact);
      case 'email_only':
        return this.resolveEmail(contact);
      default:
        return this.resolveAuto(contact, organizationId);
    }
  }

  private async resolveAuto(
    contact: ContactEntity,
    organizationId: string,
  ): Promise<ResolvedChannel | null> {
    // 1. Last successful conversation channel
    const lastConv = await this.conversationRepo.findOne({
      where: { contact_id: contact.id, organization_id: organizationId },
      order: { last_message_at: 'DESC' },
      select: ['channel'],
    });

    if (lastConv?.channel) {
      const recipientId = this.getRecipientForChannel(contact, lastConv.channel);
      if (recipientId) {
        const hasActive = await this.orgHasActiveChannel(organizationId, lastConv.channel);
        if (hasActive) return { channel: lastConv.channel, recipientId };
      }
    }

    // 2. Fall back down the org's priority chain (default: WhatsApp → SMS → Email)
    for (const channel of await this.channelPriority(organizationId)) {
      const recipientId = this.getRecipientForChannel(contact, channel);
      if (!recipientId) continue;
      if (await this.orgHasActiveChannel(organizationId, channel)) {
        return { channel, recipientId };
      }
    }

    this.logger.warn(`No channel resolved for contact ${contact.id} with strategy=auto`);
    return null;
  }

  /**
   * Order in which `auto` tries channels once the contact has no prior thread.
   * Overridable per org because it is the part that genuinely varies — the set
   * of strategy names is not, since each needs a branch in resolveStrategy().
   */
  private async channelPriority(organizationId: string): Promise<string[]> {
    try {
      const org = await this.orgRepo.findOne({
        where: { id: organizationId },
        select: ['id', 'settings'],
      });
      const configured = (org?.settings as Record<string, unknown>)?.channel_priority;
      if (Array.isArray(configured) && configured.length > 0) {
        return configured as string[];
      }
    } catch (err) {
      this.logger.warn(`Failed to read channel_priority for org ${organizationId}: ${err}`);
    }
    return DEFAULT_CHANNEL_PRIORITY;
  }

  private async resolveSameChannel(
    contact: ContactEntity,
    organizationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<ResolvedChannel | null> {
    const originalChannel = metadata?.original_channel as string | undefined;
    if (originalChannel) {
      const recipientId = this.getRecipientForChannel(contact, originalChannel);
      if (recipientId) return { channel: originalChannel, recipientId };
    }
    return this.resolveAuto(contact, organizationId);
  }

  private async resolveSpecific(
    contact: ContactEntity,
    organizationId: string,
    channelType: string,
  ): Promise<ResolvedChannel | null> {
    const recipientId = this.getRecipientForChannel(contact, channelType);
    if (!recipientId) return null;

    const hasActive = await this.orgHasActiveChannel(organizationId, channelType);
    if (!hasActive) return null;

    return { channel: channelType, recipientId };
  }

  private resolveEmail(contact: ContactEntity): ResolvedChannel | null {
    if (!contact.email) return null;
    return { channel: 'email', recipientId: contact.email };
  }

  /** Voice needs a dialable number — channel_ids.voice, else the plain phone. */
  private resolveVoice(contact: ContactEntity): ResolvedChannel | null {
    const number = contact.channel_ids?.voice ?? contact.phone;
    if (!number) return null;
    return { channel: 'voice', recipientId: number };
  }

  private getRecipientForChannel(contact: ContactEntity, channel: string): string | null {
    switch (channel) {
      case 'whatsapp':
        return contact.channel_ids?.whatsapp ?? null;
      case 'sms':
        return contact.phone ?? null;
      case 'email':
        return contact.email ?? null;
      case 'voice':
        return contact.channel_ids?.voice ?? contact.phone ?? null;
      case 'instagram':
        return contact.channel_ids?.instagram ?? null;
      case 'messenger':
        return contact.channel_ids?.messenger ?? null;
      default:
        return contact.channel_ids?.[channel] ?? null;
    }
  }

  private async orgHasActiveChannel(organizationId: string, type: string): Promise<boolean> {
    // SMS and email use global infrastructure (Telnyx/Resend) — no per-org channel entity needed
    if (type === 'email' || type === 'sms') return true;
    try {
      const channel = await this.channelsService.findActiveByType(organizationId, type);
      return !!channel;
    } catch {
      return false;
    }
  }
}
