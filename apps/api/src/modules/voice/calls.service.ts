import { Injectable, Logger, Inject, Optional, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import type { Redis } from 'ioredis';
import type { Queue } from 'bullmq';
import { CallEntity } from './call.entity';
import { CallEventEntity } from './call-event.entity';
import { MessageEntity } from '../conversation-management/message.entity';
import { ChannelsService } from '../integrations/channels.service';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';
import { ClientManagementService } from '../client-management/client-management.service';
import { ConversationManagementService } from '../conversation-management/conversation-management.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { AGENT_TRIGGER_QUEUE } from '../ai-automation/ai-automation.constants';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import type { RetellWebhookDto } from './retell-webhook.dto';
import type { CallCompletedEvent } from '@crm/shared';

const CALL_EXT_CACHE_TTL = 3600; // 1 hour dedup window

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectRepository(CallEntity)
    private readonly callRepo: Repository<CallEntity>,
    @InjectRepository(CallEventEntity)
    private readonly callEventRepo: Repository<CallEventEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @Inject(RABBITMQ_SERVICE)
    private readonly rmqClient: ClientProxy,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly channelsService: ChannelsService,
    private readonly clientService: ClientManagementService,
    private readonly conversationService: ConversationManagementService,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
    @Optional() @Inject(AGENT_TRIGGER_QUEUE) private readonly agentQueue?: Queue,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly realtimeBroadcast?: RealtimeBroadcastService,
  ) {}

  async handleWebhookEvent(dto: RetellWebhookDto): Promise<void> {
    // ── a. Resolve org from agent_id ────────────────────────────────────────
    let orgId: string | null = null;
    let channelEntityId: string | null = null;

    if (dto.agent_id) {
      // Match the same way the voice-resolve endpoint does: the Retell agent id
      // is usually stored in config.inbound_agent_id / outbound_agent_id, not in
      // external_identifier. findByExternalIdentifier only checks the latter, so
      // the worker would skip calls that resolve() happily matches — the call
      // webhook arrives but the call is never saved.
      const channel = await this.channelsService.findVoiceChannel({ agentId: dto.agent_id });
      if (channel) {
        orgId = channel.organization_id;
        channelEntityId = channel.id;
      } else {
        this.logger.warn(`No active voice/retell channel for agent_id=${dto.agent_id}`);
      }
    }

    if (!orgId) {
      this.logger.error(`Cannot resolve org for call ${dto.call_id} — skipping`);
      return;
    }

    // ── b. Find or create contact ────────────────────────────────────────────
    const phoneFrom = dto.from_number ?? 'unknown';
    const phoneTo = dto.to_number ?? 'unknown';

    // On an outbound call (follow-up steps with action='call') `from_number` is
    // our own Retell number — keying the contact off it would file the call
    // under a phantom contact and strand the sequence step in 'processing'.
    const contactNumber = dto.direction === 'outbound' ? phoneTo : phoneFrom;

    const contact = await this.clientService.findOrCreateByChannel(
      orgId,
      'voice',
      contactNumber,
    );

    // ── c. Find or create active conversation ────────────────────────────────
    const { conversation } = await this.conversationService.findOrCreateActiveConversation(
      orgId,
      contact.id,
      channelEntityId!,
      'voice',
    );

    // ── Update contact last_contacted_at — fire-and-forget
    void this.clientService.updateLastContacted(contact.id, orgId, new Date());

    // ── d. Upsert call row ───────────────────────────────────────────────────
    const call = await this.upsertCall(orgId, dto, contact.id, conversation.id, phoneFrom, phoneTo);

    // Bump last_message_at so the inbox list sorts calls chronologically —
    // otherwise voice-only conversations never touch this column and Postgres'
    // NULLS-FIRST default on DESC pins them permanently at the top.
    void this.conversationService.touchLastMessageAt(conversation.id, orgId, new Date());

    // ── e. Insert call event ─────────────────────────────────────────────────
    await this.callEventRepo.save(
      this.callEventRepo.create({
        organization_id: orgId,
        call_id: call.id,
        event_type: dto.event,
        payload: dto as unknown as Record<string, unknown>,
      }),
    );

    // ── f. Update contact with call analysis data ────────────────────────────
    if ((dto.event === 'call_ended' || dto.event === 'call_analyzed') && dto.call_analysis) {
      await this.updateContactFromCallAnalysis(orgId, contact.id, dto.call_analysis);
    }

    // ── g. Post-call: upsert one system message into the conversation timeline ─
    // call_ended and call_analyzed both fire for the same call, and the later
    // one is the first to carry the recording URL and summary. Keying on the
    // call alone (not the event) keeps a single card in the inbox and lets the
    // second event fill in what the first one did not have yet.
    if (dto.event === 'call_ended' || dto.event === 'call_analyzed') {
      await this.upsertCallMessage(orgId, conversation.id, call, dto);
    }

    // ── h. Emit RabbitMQ events ──────────────────────────────────────────────
    if (dto.event === 'call_started') {
      this.rmqClient.emit(RABBITMQ_QUEUES.CALL_STARTED, {
        organization_id: orgId,
        conversation_id: conversation.id,
        contact_id: contact.id,
        call: { id: call.id, external_call_id: call.external_call_id },
      });
      void this.realtimeBroadcast?.notifyOrg(orgId, {
        id: call.id,
        type: 'voice',
        title: dto.direction === 'outbound' ? 'Llamada saliente' : 'Llamada entrante',
        description: dto.direction === 'outbound' ? `A ${phoneTo}` : `De ${phoneFrom}`,
        href: `/inbox?conversationId=${conversation.id}`,
        conversationId: conversation.id,
        contactId: contact.id,
      });
      void this.webhookDispatcher?.dispatch('voice.call.started', orgId, {
        call_id: call.id,
        phone_from: call.phone_from,
        phone_to: call.phone_to,
      });
    }

    if (dto.event === 'call_ended' || dto.event === 'call_analyzed') {
      this.rmqClient.emit(RABBITMQ_QUEUES.CALL_COMPLETED, {
        organization_id: orgId,
        conversation_id: conversation.id,
        contact_id: contact.id,
        call: {
          id: call.id,
          external_call_id: call.external_call_id,
          phone_from: call.phone_from,
          phone_to: call.phone_to,
          duration_seconds: call.duration_seconds,
          started_at: call.started_at,
          ended_at: call.ended_at,
          summary: dto.summary,
        },
      } satisfies CallCompletedEvent);
      void this.webhookDispatcher?.dispatch('voice.call.completed', orgId, {
        call_id: call.id,
        duration: call.duration_seconds,
      });
    }

    if ((dto.event === 'call_ended' || dto.event === 'call_analyzed') && orgId) {
      void this.agentQueue?.add(
        'trigger',
        {
          event_type: 'call.completed',
          organization_id: orgId,
          conversation_id: conversation.id,
          contact_id: contact.id,
          payload: {
            call_id: call.id,
            duration_seconds: call.duration_seconds,
            summary: dto.summary,
          },
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    }

    if (dto.event === 'transcript_updated') {
      this.rmqClient.emit(RABBITMQ_QUEUES.CALL_TRANSCRIPT_UPDATED, {
        organization_id: orgId,
        call_id: call.id,
        conversation_id: conversation.id,
      });
      void this.webhookDispatcher?.dispatch('voice.transcript.received', orgId, {
        call_id: call.id,
      });
    }
  }

  /**
   * One timeline message per call, refreshed as later events arrive.
   *
   * Legacy rows used a per-event key (`call:<id>:call_ended`), so those are
   * adopted rather than left behind as a second card.
   */
  private async upsertCallMessage(
    orgId: string,
    conversationId: string,
    call: CallEntity,
    dto: RetellWebhookDto,
  ): Promise<void> {
    const channelMsgId = `call:${dto.call_id}`;
    const legacyIds = [`call:${dto.call_id}:call_ended`, `call:${dto.call_id}:call_analyzed`];

    const existing = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.organization_id = :orgId', { orgId })
      .andWhere('m.channel_message_id IN (:...ids)', { ids: [channelMsgId, ...legacyIds] })
      .orderBy('m.created_at', 'ASC')
      .getMany();

    // Retell puts the summary at the top level on call_ended but under
    // call_analysis.call_summary on call_analyzed.
    const analysisSummary = dto.call_analysis?.call_summary;
    const summary = dto.summary ?? (typeof analysisSummary === 'string' ? analysisSummary : undefined);

    const prevMeta = (existing[0]?.metadata ?? {}) as Record<string, unknown>;
    const metadata: Record<string, unknown> = {
      ...prevMeta,
      call_id: call.id,
      provider: 'retell',
      direction: call.direction ?? prevMeta.direction,
      duration_seconds: call.duration_seconds ?? prevMeta.duration_seconds,
      recording_url: call.recording_url ?? prevMeta.recording_url,
      summary: summary ?? prevMeta.summary,
      transcript: dto.transcript ?? prevMeta.transcript,
    };

    const content =
      summary ??
      (typeof prevMeta.summary === 'string' ? prevMeta.summary : undefined) ??
      `Voice call — ${call.duration_seconds ?? dto.duration ?? 0}s`;

    if (existing.length > 0) {
      const [keep, ...duplicates] = existing;
      keep.channel_message_id = channelMsgId;
      keep.content = content;
      keep.metadata = metadata;
      keep.sent_at = call.ended_at ?? keep.sent_at;
      await this.messageRepo.save(keep);

      if (duplicates.length > 0) {
        await this.messageRepo.delete(duplicates.map((m) => m.id));
        this.logger.debug(`Removed ${duplicates.length} duplicate call message(s) for ${dto.call_id}`);
      }
      return;
    }

    try {
      await this.messageRepo.save(
        this.messageRepo.create({
          organization_id: orgId,
          conversation_id: conversationId,
          content,
          type: 'system',
          direction: 'inbound',
          sender_type: 'system',
          channel: 'voice',
          channel_message_id: channelMsgId,
          status: 'delivered',
          metadata,
          sent_at: call.ended_at ?? new Date(),
        }),
      );
    } catch (err: unknown) {
      // Concurrent call_ended / call_analyzed workers can both miss the SELECT.
      if ((err as { code?: string })?.code === '23505') {
        this.logger.debug(`Call message for ${dto.call_id} created concurrently — skipping`);
      } else {
        throw err;
      }
    }
  }

  async upsertCall(
    orgId: string,
    dto: RetellWebhookDto,
    contactId: string,
    conversationId: string,
    phoneFrom: string,
    phoneTo: string,
  ): Promise<CallEntity> {
    // Check Redis dedup cache first
    const cacheKey = `call:ext:${dto.call_id}`;
    const cachedId = await this.redis.get(cacheKey);

    let call: CallEntity | null = null;
    if (cachedId) {
      call = await this.callRepo.findOne({ where: { id: cachedId } });
    }

    if (!call) {
      call = await this.callRepo.findOne({ where: { external_call_id: dto.call_id } });
    }

    if (!call) {
      call = this.callRepo.create({
        organization_id: orgId,
        contact_id: contactId,
        conversation_id: conversationId,
        external_call_id: dto.call_id,
        phone_from: phoneFrom,
        phone_to: phoneTo,
        direction: dto.direction ?? 'inbound',
        status: 'initiated',
        provider: 'retell',
        channel: 'voice',
      });
    } else if (dto.direction && call.direction !== dto.direction) {
      // Backfill direction if an earlier event created the row without it.
      call.direction = dto.direction;
    }

    // Apply status transitions
    switch (dto.event) {
      case 'call_started':
        call.status = 'in_progress';
        call.started_at = new Date();
        break;
      case 'call_ended':
      case 'call_analyzed':
        call.status = 'completed';
        call.ended_at = new Date();
        if (dto.duration != null) {
          call.duration_seconds = dto.duration;
        } else if (dto.start_timestamp && dto.end_timestamp) {
          call.duration_seconds = Math.round((dto.end_timestamp - dto.start_timestamp) / 1000);
        }
        if (dto.recording_url) {
          call.recording_url = dto.recording_url;
        }
        break;
    }

    // Ensure contact/conversation are linked even if call was created earlier
    call.contact_id = contactId;
    call.conversation_id = conversationId;

    const saved = await this.callRepo.save(call);

    // Cache the internal ID for fast dedup
    await this.redis.setex(cacheKey, CALL_EXT_CACHE_TTL, saved.id);

    return saved;
  }

  /**
   * Extract contact data from Retell's call_analysis and update the contact
   * record: custom_analysis_data → standard fields / custom_fields (as
   * before), plus Retell's own user_sentiment/call_summary → ai_insights.
   * The latter runs even when custom_analysis_data is empty — sentiment can
   * be present on a call with no captured data.
   */
  private async updateContactFromCallAnalysis(
    orgId: string,
    contactId: string,
    callAnalysis: Record<string, unknown>,
  ): Promise<void> {
    try {
      const contact = await this.clientService.findById(contactId, orgId);
      if (!contact) return;

      const updateDto: Record<string, unknown> = {};

      const customData = callAnalysis.custom_analysis_data;
      if (customData && typeof customData === 'object' && Object.keys(customData).length > 0) {
        const data = customData as Record<string, unknown>;

        // Map of known analysis keys → contact standard fields
        const KNOWN_FIELD_MAP: Record<string, string> = {
          first_name: 'first_name',
          nombre: 'first_name',
          name: 'first_name',
          last_name: 'last_name',
          apellido: 'last_name',
          email: 'email',
          correo: 'email',
          phone: 'phone',
          telefono: 'phone',
          phone_number: 'phone',
        };

        const extraFields: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(data)) {
          if (value == null || value === '') continue;

          const normalizedKey = key.toLowerCase().trim();
          const mappedField = KNOWN_FIELD_MAP[normalizedKey];

          if (mappedField) {
            // Only update standard field if contact doesn't have a value yet or it's empty
            const currentValue = contact[mappedField as keyof typeof contact];
            if (!currentValue || currentValue === '' || currentValue === 'unknown') {
              updateDto[mappedField] = String(value);
            }
          } else {
            extraFields[normalizedKey] = value;
          }
        }

        // Merge extra fields into custom_fields
        if (Object.keys(extraFields).length > 0) {
          updateDto.custom_fields = { ...(contact.custom_fields ?? {}), ...extraFields };
        }
      }

      // Retell's standard analysis fields → ai_insights (shallow-merged in
      // ClientManagementService.update, so this never wipes an intent set
      // elsewhere e.g. by the chat agent's update_contact tool call).
      const aiInsights: Record<string, unknown> = {};
      if (typeof callAnalysis.user_sentiment === 'string' && callAnalysis.user_sentiment) {
        aiInsights.sentiment = callAnalysis.user_sentiment.toLowerCase();
      }
      if (typeof callAnalysis.call_summary === 'string' && callAnalysis.call_summary) {
        aiInsights.summary = callAnalysis.call_summary;
      }
      if (Object.keys(aiInsights).length > 0) {
        updateDto.ai_insights = aiInsights;
      }

      if (Object.keys(updateDto).length === 0) return;

      await this.clientService.update(contactId, orgId, updateDto as any);
      this.logger.log(`Contact ${contactId} updated from call analysis (${Object.keys(updateDto).join(', ')})`);
    } catch (err) {
      this.logger.warn(`Failed to update contact from call analysis: ${(err as Error).message}`);
    }
  }

  async findById(callId: string, orgId: string): Promise<CallEntity | null> {
    return this.callRepo.findOne({
      where: { id: callId, organization_id: orgId },
      relations: ['contact'],
    });
  }

  async findByOrg(
    orgId: string,
    limit = 20,
    offset = 0,
  ): Promise<[CallEntity[], number]> {
    return this.callRepo.findAndCount({
      where: { organization_id: orgId },
      relations: ['contact'],
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Org-wide call stats. Computed in SQL rather than from the page the UI
   * happens to be showing, so the numbers do not change as you page.
   */
  async getStats(orgId: string): Promise<{
    total: number;
    active: number;
    avg_duration_seconds: number | null;
  }> {
    const row = await this.callRepo
      .createQueryBuilder('c')
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE c.status = 'in_progress')`, 'active')
      .addSelect(
        `AVG(c.duration_seconds) FILTER (WHERE c.status = 'completed' AND c.duration_seconds IS NOT NULL)`,
        'avg_duration',
      )
      .where('c.organization_id = :orgId', { orgId })
      .getRawOne<{ total: string; active: string; avg_duration: string | null }>();

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      avg_duration_seconds: row?.avg_duration != null ? Math.round(Number(row.avg_duration)) : null,
    };
  }

  async respond(
    retellCallId: string,
    orgId: string,
    responseText: string,
  ): Promise<{ success: boolean; error?: string }> {
    const call = await this.callRepo.findOne({
      where: { external_call_id: retellCallId, organization_id: orgId },
    });
    if (!call) throw new NotFoundException(`Call ${retellCallId} not found`);

    // Store audit event
    await this.callEventRepo.save(
      this.callEventRepo.create({
        organization_id: orgId,
        call_id: call.id,
        event_type: 'ai_response_sent',
        payload: { response_text: responseText, sent_at: new Date().toISOString() },
      }),
    );

    // Forward to Retell API
    const apiKey = this.configService?.get<string>('RETELL_API_KEY') ?? '';
    if (!apiKey) {
      this.logger.warn('RETELL_API_KEY not set — skipping Retell respond call');
      return { success: true };
    }

    try {
      const res = await fetch(
        `https://api.retellai.com/v2/update-call/${retellCallId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            retell_llm_dynamic_variables: { crm_ai_response: responseText },
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`Retell PATCH /v2/update-call returned ${res.status}: ${text}`);
        return { success: false, error: `HTTP ${res.status}` };
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Retell respond failed: ${msg}`);
      return { success: false, error: msg };
    }
  }
}
