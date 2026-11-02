import { Injectable, NotFoundException, BadRequestException, Logger, Inject, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import type { Queue } from 'bullmq';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';
import { ClientManagementService } from '../client-management/client-management.service';
import { ChannelsService } from '../integrations/channels.service';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { AGENT_TRIGGER_QUEUE } from '../ai-automation/ai-automation.constants';
import { OUTBOUND_DISPATCH_QUEUE } from './outbound-dispatch.constants';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import type { PaginationQuery, PaginatedResponse, MessageReceivedEvent, SequenceStatus } from '@crm/shared';
import { AutomationSequenceService } from '../automation-engine/automation-sequence.service';
import { buildPaginationMeta, ChannelType } from '@crm/shared';
import type { IngestMessageDto } from './ingest-message.dto';

export interface ConversationContact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ConversationLastMessage {
  content: string;
  created_at: string;
  direction: string;
}

export type ConversationWithContact = ConversationEntity & {
  contact?: ConversationContact;
  last_message?: ConversationLastMessage;
  unread_count?: number;
};

export interface CreateConversationDto {
  contact_id: string;
  channel: string;
  subject?: string;
  ai_agent_id?: string;
  assigned_agent_id?: string;
}

export interface SendMessageDto {
  content: string;
  type?: string;
  direction?: string;
  sender_id?: string;
  media_url?: string;
  metadata?: Record<string, unknown>;
}

// Channel types that support outbound dispatch via external API
const OUTBOUND_CHANNEL_TYPES = new Set<string>([
  ChannelType.FACEBOOK, ChannelType.INSTAGRAM, ChannelType.WHATSAPP, ChannelType.SMS,
]);

// Chat channels that should trigger auto follow-up sequences
const CHAT_CHANNELS = new Set<string>([
  ChannelType.WHATSAPP, ChannelType.SMS, ChannelType.WEBCHAT, ChannelType.FACEBOOK, ChannelType.INSTAGRAM,
]);

@Injectable()
export class ConversationManagementService {
  private readonly logger = new Logger(ConversationManagementService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @Inject(RABBITMQ_SERVICE)
    private readonly rmqClient: ClientProxy,
    private readonly clientService: ClientManagementService,
    private readonly channelsService: ChannelsService,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
    @Optional() @Inject(AGENT_TRIGGER_QUEUE) private readonly agentQueue?: Queue,
    @Optional() @Inject(OUTBOUND_DISPATCH_QUEUE) private readonly outboundQueue?: Queue,
    @Optional() private readonly realtimeBroadcast?: RealtimeBroadcastService,
    @Optional() private readonly sequenceService?: AutomationSequenceService,
  ) {}

  private isOptOutMessage(content: string): boolean {
    const normalized = content.toLowerCase().trim();
    
    const optOutPatterns = [
      /\bno\s+(quiero|deseo|necesito)\b/i,
      /\bya\s+no\b/i,
      /\bno\s+m[aá]s\b/i,
      /\b(stop|cancelar|parar|desuscribir|unsubscribe)\b/i,
      /\bdeja\s+de\s+(escribir|enviar|mandar)/i,
      /\bno\s+(me\s+)?(contacten|escriban|envien|manden)/i,
    ];

    return optOutPatterns.some(pattern => pattern.test(normalized));
  }

  async findAll(
    organizationId: string,
    query: PaginationQuery & { status?: string; channel?: string; assigned_to?: 'ai' | 'human' },
  ): Promise<PaginatedResponse<ConversationWithContact>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organization_id: organizationId };
    if (query.status) where['status'] = query.status;
    if (query.channel) where['channel'] = query.channel;
    // bot_active is the same flag `handoff()` toggles: true while the AI owns
    // the conversation, false once a human has taken over.
    if (query.assigned_to === 'ai') where['bot_active'] = true;
    if (query.assigned_to === 'human') where['bot_active'] = false;

    // Use query builder to properly handle NULL values in ordering.
    // Pinned conversations float to the top, then by most recent activity.
    // NULLS LAST ensures conversations without messages don't appear first.
    const qb = this.conversationRepo.createQueryBuilder('conv')
      .where(where)
      .orderBy('conv.is_pinned', 'DESC')
      .addOrderBy('conv.last_message_at', 'DESC', 'NULLS LAST')
      .skip(skip)
      .take(limit);

    const [conversations, total] = await qb.getManyAndCount();

    if (conversations.length === 0) {
      return { items: [], meta: buildPaginationMeta(total, page, limit) };
    }

    const conversationIds = conversations.map((c) => c.id);
    const contactIds = [...new Set(conversations.map((c) => c.contact_id).filter(Boolean))];

    // Batch-fetch contacts
    const contacts = await this.clientService.findByIds(contactIds, organizationId);
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    // Batch-fetch last messages via DISTINCT ON (most efficient for Postgres)
    type LastMsgRow = { id: string; conversation_id: string; content: string; sent_at: string; direction: string };
    const lastMsgs = (await this.messageRepo.query(
      `SELECT DISTINCT ON (m.conversation_id) m.id, m.conversation_id, m.content, m.sent_at, m.direction
       FROM conversations.messages m
       WHERE m.conversation_id = ANY($1)
       ORDER BY m.conversation_id, m.sent_at DESC`,
      [conversationIds],
    )) as LastMsgRow[];
    const lastMsgMap = new Map(lastMsgs.map((m) => [m.conversation_id, m]));

    // Batch-count unread inbound messages — anything after last_read_at, or
    // every inbound message when the conversation has never been opened.
    type UnreadRow = { conversation_id: string; count: string };
    const unreadRows = (await this.messageRepo.query(
      `SELECT m.conversation_id, count(*) AS count
       FROM conversations.messages m
       JOIN conversations.conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ANY($1)
         AND m.direction = 'inbound'
         AND m.sent_at > COALESCE(c.last_read_at, 'epoch'::timestamptz)
       GROUP BY m.conversation_id`,
      [conversationIds],
    )) as UnreadRow[];
    const unreadMap = new Map(unreadRows.map((r) => [r.conversation_id, Number(r.count)]));

    const items: ConversationWithContact[] = conversations.map((conv) => {
      const c = contactMap.get(conv.contact_id);
      const lm = lastMsgMap.get(conv.id);
      return Object.assign(conv, {
        contact: c
          ? { id: c.id, first_name: c.first_name, last_name: c.last_name ?? null, email: c.email ?? null, phone: c.phone ?? null }
          : undefined,
        last_message: lm
          ? { content: lm.content, created_at: lm.sent_at, direction: lm.direction }
          : undefined,
        unread_count: unreadMap.get(conv.id) ?? 0,
      });
    });

    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async findById(id: string, organizationId: string): Promise<ConversationWithContact> {
    const conv = await this.conversationRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!conv) throw new NotFoundException(`Conversation ${id} not found`);

    // Opening a conversation marks it read — fire-and-forget, doesn't block the response.
    void this.conversationRepo.update({ id, organization_id: organizationId }, { last_read_at: new Date() });

    if (conv.contact_id) {
      const contacts = await this.clientService.findByIds([conv.contact_id], organizationId);
      const c = contacts[0];
      if (c) {
        return Object.assign(conv, {
          contact: { id: c.id, first_name: c.first_name, last_name: c.last_name ?? null, email: c.email ?? null, phone: c.phone ?? null },
        });
      }
    }
    return conv as ConversationWithContact;
  }

  async setPinned(id: string, organizationId: string, pinned: boolean): Promise<ConversationEntity> {
    const conv = await this.conversationRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!conv) throw new NotFoundException(`Conversation ${id} not found`);
    conv.is_pinned = pinned;
    return this.conversationRepo.save(conv);
  }

  async create(organizationId: string, dto: CreateConversationDto): Promise<ConversationEntity> {
    const conv = this.conversationRepo.create({
      organization_id: organizationId,
      ...dto,
    });
    const saved = await this.conversationRepo.save(conv);

    this.rmqClient.emit(RABBITMQ_QUEUES.CONVERSATION_ASSIGN, {
      conversation_id: saved.id,
      organization_id: organizationId,
    });

    return saved;
  }

  async sendMessage(
    conversationId: string,
    organizationId: string,
    dto: SendMessageDto,
  ): Promise<MessageEntity> {
    const conv = await this.findById(conversationId, organizationId);

    const message = this.messageRepo.create({
      organization_id: organizationId,
      conversation_id: conversationId,
      content: dto.content,
      type: dto.type ?? 'text',
      direction: dto.direction ?? 'outbound',
      sender_id: dto.sender_id,
      media_url: dto.media_url,
      metadata: dto.metadata ?? {},
      status: 'pending',
    });

    const saved = await this.messageRepo.save(message);

    await this.conversationRepo.update(
      { id: conversationId, organization_id: organizationId },
      { last_message_at: new Date() },
    );

    this.rmqClient.emit(RABBITMQ_QUEUES.MESSAGE_SEND, {
      message_id: saved.id,
      conversation_id: conversationId,
      organization_id: organizationId,
      contact_id: conv.contact_id,
      direction: dto.direction ?? 'outbound',
      channel: conv.channel,
    });

    void this.webhookDispatcher?.dispatch('message.sent', organizationId, {
      conversation_id: conversationId,
      message_id: saved.id,
      content: dto.content,
    });

    // Dispatch to external channel API via BullMQ (async, non-blocking).
    // If enqueueing itself throws (e.g. Redis producer connection not yet
    // ready right after a deploy), the message would otherwise be stuck at
    // 'pending' forever with zero trace anywhere — OutboundDispatchProcessor
    // never sees a job it was never handed. Mark it 'failed' explicitly so
    // this is visible instead of silent.
    if (OUTBOUND_CHANNEL_TYPES.has(conv.channel) && this.outboundQueue) {
      this.outboundQueue
        .add(
          'dispatch',
          {
            conversationId,
            messageId: saved.id,
            content: dto.content,
            organizationId,
            channel: conv.channel,
            contactId: conv.contact_id,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        )
        .catch(async (err) => {
          this.logger.error(
            `Failed to enqueue OutboundDispatch for message ${saved.id} (channel=${conv.channel}): ${err.message}`,
            err.stack,
          );
          await this.messageRepo.update({ id: saved.id }, { status: 'failed' });
        });
    }

    return saved;
  }

  async getMessages(conversationId: string, organizationId: string) {
    await this.findById(conversationId, organizationId);
    const items = await this.messageRepo.find({
      where: { conversation_id: conversationId, organization_id: organizationId },
      order: { sent_at: 'ASC' },
    });
    return { items, meta: buildPaginationMeta(items.length, 1, items.length || 1) };
  }

  async getRecentMessagesForContact(
    orgId: string,
    contactId: string,
    limit = 30,
  ): Promise<{ channel: string; direction: string; content: string; sent_at: Date }[]> {
    return this.messageRepo.query(
      `SELECT m.content, m.direction, m.sent_at, c.channel
       FROM conversations.messages m
       JOIN conversations.conversations c ON c.id = m.conversation_id
       WHERE c.contact_id = $1 AND c.organization_id = $2 AND m.content != ''
       ORDER BY m.sent_at DESC
       LIMIT $3`,
      [contactId, orgId, limit],
    );
  }

  // Bumps last_message_at so the conversation sorts correctly in the inbox list.
  // Needed by channels (e.g. voice) that write activity via a side-channel
  // (call events) instead of ConversationManagementService.sendMessage/ingestMessage,
  // which are the only two places that otherwise touch this column.
  async touchLastMessageAt(id: string, organizationId: string, at: Date): Promise<void> {
    await this.conversationRepo.update(
      { id, organization_id: organizationId },
      { last_message_at: at },
    );
  }

  async findByContactId(organizationId: string, contactId: string): Promise<ConversationEntity[]> {
    return this.conversationRepo.find({
      where: { organization_id: organizationId, contact_id: contactId },
      order: { last_message_at: 'DESC' },
    });
  }

  async resolve(id: string, organizationId: string): Promise<ConversationEntity> {
    const conv = await this.findById(id, organizationId);
    conv.status = 'resolved';
    conv.resolved_at = new Date();
    const saved = await this.conversationRepo.save(conv);

    this.rmqClient.emit(RABBITMQ_QUEUES.CONVERSATION_CLOSED, {
      organization_id: organizationId,
      conversation_id: saved.id,
      contact_id: saved.contact_id,
      channel: saved.channel,
    });

    return saved;
  }

  async handoff(id: string, organizationId: string): Promise<ConversationEntity> {
    const conv = await this.findById(id, organizationId);
    conv.bot_active = !conv.bot_active;
    const saved = await this.conversationRepo.save(conv);

    this.rmqClient.emit(RABBITMQ_QUEUES.CONVERSATION_ASSIGN, {
      conversation_id: saved.id,
      organization_id: organizationId,
      bot_active: saved.bot_active,
    });

    return saved;
  }

  async findOrCreateActiveConversation(
    orgId: string,
    contactId: string,
    _channelId: string,
    channel: string,
  ): Promise<{ conversation: ConversationEntity; created: boolean }> {
    const existing = await this.conversationRepo.findOne({
      where: { organization_id: orgId, contact_id: contactId, channel, status: 'open' },
    });
    if (existing) return { conversation: existing, created: false };

    const conv = await this.conversationRepo.save(
      this.conversationRepo.create({
        organization_id: orgId,
        contact_id: contactId,
        channel,
        status: 'open',
      }),
    );

    this.rmqClient.emit(RABBITMQ_QUEUES.CONVERSATION_ASSIGN, {
      conversation_id: conv.id,
      organization_id: orgId,
    });

    return { conversation: conv, created: true };
  }

  async ingestMessage(
    dto: IngestMessageDto,
  ): Promise<{ conversation_id: string; message_id: string; contact_id: string | null }> {
    // Step 1: Resolve channel → orgId
    // Supports both the channel's DB primary key and the webchat widget_id stored in config
    const channelEntity =
      (await this.channelsService.findById(dto.channel_id)) ??
      (await this.channelsService.findByWidgetId(dto.channel_id));
    if (!channelEntity) throw new NotFoundException('Channel not found');
    if (!channelEntity.is_active) throw new BadRequestException('Channel is inactive');
    const orgId = channelEntity.organization_id;

    // Apply server-side defaults so callers only need channel_id + content + sender_identifier
    const channel_message_id = dto.channel_message_id ?? randomUUID();
    const direction = dto.direction ?? 'inbound';
    const sender_type = dto.sender_type ?? 'user';

    // Step 2: Dedup check (only meaningful when caller provided a stable channel_message_id)
    if (dto.channel_message_id) {
      const dupe = await this.messageRepo.findOne({
        where: { organization_id: orgId, channel_message_id },
        select: ['id', 'conversation_id'],
      });
      if (dupe) {
        return { conversation_id: dupe.conversation_id, message_id: dupe.id, contact_id: null };
      }
    }

    // Step 3: Resolve display name from channel platform if needed
    let displayName = dto.sender_display_name;
    if (!displayName && (channelEntity.type === ChannelType.FACEBOOK || channelEntity.type === ChannelType.INSTAGRAM)) {
      const cfg = channelEntity.config as Record<string, unknown>;
      const accessToken = (cfg?.page_access_token ?? cfg?.access_token) as string | undefined;
      if (accessToken && dto.sender_identifier) {
        const profile = await this.channelsService.fetchSenderProfile(
          channelEntity.type,
          dto.sender_identifier,
          accessToken,
        );
        displayName = profile.name || profile.username;
      }
    }

    // Step 3b: Find or create contact
    const contact = await this.clientService.findOrCreateByChannel(
      orgId,
      channelEntity.type,
      dto.sender_identifier ?? channel_message_id,
      displayName,
    );

    // Step 4: Find or create active conversation
    const { conversation } = await this.findOrCreateActiveConversation(
      orgId,
      contact.id,
      dto.channel_id,
      channelEntity.type,
    );

    // Step 5: Save message — catch race-condition dupe via unique constraint
    let message: MessageEntity;
    try {
      message = await this.messageRepo.save(
        this.messageRepo.create({
          organization_id: orgId,
          conversation_id: conversation.id,
          content: dto.content,
          type: dto.type ?? 'text',
          direction,
          sender_type,
          channel: channelEntity.type,
          channel_message_id,
          status: 'pending',
          metadata: dto.metadata ?? {},
          sent_at: dto.sent_at ? new Date(dto.sent_at) : new Date(),
        }),
      );
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === '23505') {
        // Race condition — another request inserted same channel_message_id
        const existing = await this.messageRepo.findOne({
          where: { organization_id: orgId, channel_message_id },
        });
        if (!existing) throw err;
        message = existing;
      } else {
        throw err;
      }
    }

    // Step 6: Update last_message_at + contact last_contacted_at — fire-and-forget
    const now = new Date();
    void this.conversationRepo.update({ id: conversation.id }, { last_message_at: now });
    void this.clientService.updateLastContacted(contact.id, orgId, now);

    // Step 6b: Inbound message → check for opt-out or reset sequence timer (event-driven, fire-and-forget)
    if (direction === 'inbound' && this.sequenceService) {
      void this.sequenceService.findActive(orgId, contact.id).then(async (active) => {
        if (active) {
          // Check if message indicates opt-out or final intent
          const isOptOut = this.isOptOutMessage(dto.content);
          if (isOptOut) {
            await this.sequenceService!.cancel(orgId, active.id, 'opt_out');
          } else {
            await this.sequenceService!.resetTimer(orgId, active.id);
          }
        }
      }).catch(() => {});
    }

    if (direction === 'inbound') {
      const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim() || 'un contacto';
      void this.realtimeBroadcast?.notifyOrg(orgId, {
        id: message.id,
        type: 'message',
        title: `Nuevo mensaje de ${name}`,
        description: dto.content.slice(0, 100),
        href: `/inbox?conversationId=${conversation.id}`,
        conversationId: conversation.id,
        contactId: contact.id,
      });
    }

    // Step 7: Emit RabbitMQ event — fire-and-forget
    this.rmqClient.emit(RABBITMQ_QUEUES.MESSAGE_RECEIVED, {
      organization_id: orgId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      channel: channelEntity.type,
      message: {
        id: message.id,
        content: dto.content,
        direction: direction as 'inbound' | 'outbound',
        sender_type: sender_type as 'agent' | 'system' | 'user' | 'ai',
        channel_message_id,
        metadata: dto.metadata ?? {},
        sent_at: message.sent_at,
      },
    } satisfies MessageReceivedEvent);

    // Step 8: Dispatch webhook — fire-and-forget
    void this.webhookDispatcher?.dispatch('message.received', orgId, {
      conversation_id: conversation.id,
      contact_id: contact.id,
      message: dto.content,
      channel: channelEntity.type,
    });

    // Step 9: Enqueue agent trigger — fire-and-forget. Inbound only: this event
    // feeds bots that reply to the customer (n8n workflows, ProSales) — firing
    // it for our own outbound sends would let a bot react to its own message
    // (and, once ProSales' send_message loop is wired in, loop forever).
    if (direction === 'inbound') {
      void this.agentQueue?.add(
        'trigger',
        {
          event_type: 'message.received',
          organization_id: orgId,
          conversation_id: conversation.id,
          contact_id: contact.id,
          payload: { message: dto.content, channel: channelEntity.type },
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    }

    return { conversation_id: conversation.id, message_id: message.id, contact_id: contact.id };
  }
}
