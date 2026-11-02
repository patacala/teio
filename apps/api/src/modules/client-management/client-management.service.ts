import { Injectable, NotFoundException, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';
import { WebhookDispatcherService } from '../integrations/webhook-dispatcher.service';
import { RealtimeBroadcastService } from '../../infrastructure/realtime/realtime-broadcast.service';
import { ContactEntity } from './contact.entity';
import { ContactDataUpdateEntity } from './contact-data-update.entity';
import { CompaniesService } from './companies.service';
import { MessageEntity } from '../conversation-management/message.entity';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { CallEntity } from '../voice/call.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { ContactFunnelHistoryEntity } from '../funnels/contact-funnel-history.entity';
import { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import { FunnelEntity } from '../funnels/funnel.entity';
import { UserEntity } from '../users/user.entity';
import type { PaginationQuery } from '@crm/shared';
import { buildPaginationMeta, ChannelType } from '@crm/shared';

export interface CreateContactCompanyDto {
  name: string;
  company_type?: string;
  website?: string;
  logo?: string;
  demo_link?: string;
  company_context?: string;
}

export interface CreateContactDto {
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_id?: string;
  company?: CreateContactCompanyDto;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  channel_ids?: Record<string, string>;
  handled_by?: string;
  lead_stage?: string;
}

export interface AiInsights {
  intent?: string;
  sentiment?: string;
  summary?: string;
}

export interface UpdateContactDto {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: string;
  tags?: string[];
  lead_score?: number;
  lead_stage?: string;
  custom_fields?: Record<string, unknown>;
  assigned_to?: string;
  handled_by?: string;
  ai_insights?: AiInsights;
}

export interface ActivityEvent {
  type: 'message' | 'voice_call' | 'appointment_event' | 'system_event' | 'funnel_change' | 'contact_data_updated';
  id: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface ActivityPage {
  events: ActivityEvent[];
  next_cursor: string | null;
}

const SEARCHABLE_COLUMNS = ['phone', 'email', 'first_name', 'last_name'] as const;
type SearchableColumn = (typeof SEARCHABLE_COLUMNS)[number];

/**
 * Points from `custom_fields.urgency_level`, tiered instead of a single
 * hot/not-hot cutoff. English + Spanish values, since the agent (n8n/Retell)
 * may write either depending on the org's language.
 */
const URGENCY_SCORE: Record<string, number> = {
  critical: 90, urgent: 90, asap: 90, immediate: 90,
  urgente: 90, inmediato: 90, critico: 90, crítico: 90,
  high: 75, alto: 75, alta: 75,
  medium: 50, moderate: 50, normal: 50,
  medio: 50, media: 50,
  low: 20, bajo: 20, baja: 20,
  none: 0, ninguno: 0, ninguna: 0,
};

/** Points per completed BANT field — same 4 keys the "Qualified (BANT)" rule checks. */
const BANT_POINTS = 10;

/** Loose boolean match: the agent's `true` / `"true"` / `"yes"` all count (mirrors funnel-rules.service.ts). */
function isTruthyField(value: unknown): boolean {
  return value === true || value === 'true' || value === 'yes';
}

/** A free-text BANT field (timeline, service_needed) counts once it's non-empty. */
function isPresentField(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/** Channels whose identifier is a phone number and therefore interchangeable. */
const PHONE_CHANNELS: string[] = [ChannelType.VOICE, ChannelType.SMS, ChannelType.WHATSAPP];

/**
 * Last 10 digits of a phone number, which is what two spellings of the same
 * number always share. Retell hands us `+16452147996` while the contact was
 * saved as `16452147996`; comparing raw strings files the call under a new
 * phantom contact and strands whatever sequence was waiting on the real one.
 * Ten digits is short enough to survive a missing country code and long enough
 * not to collide between distinct numbers within one organization.
 */
function phoneMatchKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}

interface ContactQuery extends PaginationQuery {
  stage_id?: string;
  field?: string;
  value?: string;
}

@Injectable()
export class ClientManagementService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contactRepo: Repository<ContactEntity>,
    @InjectRepository(ContactDataUpdateEntity)
    private readonly dataUpdateRepo: Repository<ContactDataUpdateEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(CallEntity)
    private readonly callRepo: Repository<CallEntity>,
    @InjectRepository(AppointmentEntity)
    private readonly appointmentRepo: Repository<AppointmentEntity>,
    @InjectRepository(ContactFunnelHistoryEntity)
    private readonly historyRepo: Repository<ContactFunnelHistoryEntity>,
    @InjectRepository(FunnelStageEntity)
    private readonly stageRepo: Repository<FunnelStageEntity>,
    @InjectRepository(FunnelEntity)
    private readonly funnelRepo: Repository<FunnelEntity>,
    private readonly companiesService: CompaniesService,
    @Optional() @Inject(RABBITMQ_SERVICE) private readonly rmqClient?: ClientProxy,
    @Optional() private readonly webhookDispatcher?: WebhookDispatcherService,
    @Optional() private readonly realtimeBroadcast?: RealtimeBroadcastService,
  ) {}

  async findAll(
    organizationId: string,
    query: ContactQuery,
  ): Promise<{ items: ContactEntity[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.contactRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.company', 'company')
      .where('c.organization_id = :orgId', { orgId: organizationId });

    if (query.field && query.value && SEARCHABLE_COLUMNS.includes(query.field as SearchableColumn)) {
      qb.andWhere(`c.${query.field} ILIKE :fieldValue`, { fieldValue: `%${query.value}%` });
    } else if (query.search) {
      const q = `%${query.search}%`;
      qb.andWhere(
        '(c.first_name ILIKE :q OR c.last_name ILIKE :q OR c.email ILIKE :q OR c.phone ILIKE :q)',
        { q },
      );
    }

    if (query.stage_id) {
      qb.andWhere('c.lead_stage = :stageId', { stageId: query.stage_id });
    }

    qb.orderBy('c.created_at', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async getStats(organizationId: string): Promise<{
    total: number;
    new_this_month: number;
    ai_handled: number;
    human_handled: number;
  }> {
    const total = await this.contactRepo.count({ where: { organization_id: organizationId } });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const new_this_month = await this.contactRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.created_at >= :start', { start: startOfMonth })
      .getCount();

    const ai_handled = await this.contactRepo.count({
      where: { organization_id: organizationId, handled_by: 'ai' },
    });

    return { total, new_this_month, ai_handled, human_handled: total - ai_handled };
  }

  async exportContacts(organizationId: string): Promise<ContactEntity[]> {
    return this.contactRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string, organizationId: string): Promise<ContactEntity> {
    const contact = await this.contactRepo.findOne({
      where: { id, organization_id: organizationId },
      relations: ['company'],
    });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return contact;
  }

  async findByIds(
    ids: string[],
    organizationId: string,
  ): Promise<ContactEntity[]> {
    if (ids.length === 0) return [];
    return this.contactRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.first_name', 'c.last_name', 'c.email', 'c.phone'])
      .where('c.id IN (:...ids)', { ids })
      .andWhere('c.organization_id = :orgId', { orgId: organizationId })
      .getMany();
  }

  private async resolveDefaultStage(organizationId: string): Promise<string | null> {
    // First stage (by position) of the OLDEST funnel that actually HAS stages.
    // An empty funnel must never shadow a real one and strand new contacts with
    // no stage (which also blocks the funnel automation from ever moving them).
    const row = await this.stageRepo
      .createQueryBuilder('s')
      .innerJoin(FunnelEntity, 'f', 'f.id = s.funnel_id')
      .where('s.organization_id = :org', { org: organizationId })
      .orderBy('f.created_at', 'ASC')
      .addOrderBy('s.position', 'ASC')
      .select('s.id', 'id')
      .limit(1)
      .getRawOne<{ id: string }>();
    return row?.id ?? null;
  }

  async create(organizationId: string, dto: CreateContactDto, actorUserId?: string): Promise<ContactEntity> {
    const defaultStage = dto.lead_stage ?? (await this.resolveDefaultStage(organizationId));

    let companyId = dto.company_id;
    if (dto.company) {
      const company = await this.companiesService.findOrCreate(organizationId, dto.company);
      companyId = company.id;
    }

    const { company: _company, ...contactData } = dto;
    const contact = this.contactRepo.create({
      organization_id: organizationId,
      handled_by: 'human',
      ...contactData,
      company_id: companyId ?? undefined,
      lead_stage: defaultStage ?? undefined,
    });
    const saved = await this.contactRepo.save(contact);

    this.rmqClient?.emit(RABBITMQ_QUEUES.CONTACT_CREATED, {
      organization_id: organizationId,
      contact_id: saved.id,
      first_name: saved.first_name,
      last_name: saved.last_name,
      email: saved.email,
      phone: saved.phone,
    });

    void this.webhookDispatcher?.dispatch('contact.created', organizationId, {
      contact_id: saved.id,
      name: saved.first_name,
    });

    const name = `${saved.first_name} ${saved.last_name ?? ''}`.trim() || 'Nuevo contacto';
    void this.realtimeBroadcast?.notifyOrg(organizationId, {
      type: 'lead',
      title: `Nuevo contacto: ${name}`,
      href: `/contacts/${saved.id}`,
      contactId: saved.id,
      actorUserId,
    });
    return saved;
  }

  async update(id: string, organizationId: string, dto: UpdateContactDto): Promise<ContactEntity> {
    const contact = await this.findById(id, organizationId);

    // Track changes to core identity fields
    const trackedFields = ['first_name', 'last_name', 'email', 'phone'] as const;
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of trackedFields) {
      const newVal = dto[field];
      if (newVal !== undefined && newVal !== contact[field]) {
        changedFields[field] = { from: contact[field] ?? null, to: newVal };
      }
    }

    // Capture originals BEFORE Object.assign (which would replace them) so the
    // merges below actually merge with the prior values, not with themselves.
    const prevInsights = (contact.ai_insights as Record<string, unknown>) ?? {};
    const prevCustomFields = (contact.custom_fields as Record<string, unknown>) ?? {};

    Object.assign(contact, dto);
    // Shallow-merge, not replace: an update may report only `sentiment` (or a
    // single captured field) and must not wipe a still-valid `intent`/`summary`
    // or other custom fields captured earlier (incl. human-entered ones).
    if (dto.ai_insights !== undefined) {
      contact.ai_insights = { ...prevInsights, ...dto.ai_insights };
    }
    if (dto.custom_fields !== undefined) {
      contact.custom_fields = { ...prevCustomFields, ...dto.custom_fields };
      this.applyLeadScoreSignals(contact);
    }
    const saved = await this.contactRepo.save(contact);

    if (Object.keys(changedFields).length > 0) {
      void this.dataUpdateRepo.save(
        this.dataUpdateRepo.create({
          contact_id: id,
          organization_id: organizationId,
          changed_fields: changedFields,
          changed_by: null,
        }),
      );
    }

    this.rmqClient?.emit(RABBITMQ_QUEUES.CONTACT_UPDATED, {
      organization_id: organizationId,
      contact_id: id,
      changed_fields: Object.keys(changedFields),
      first_name: saved.first_name,
      last_name: saved.last_name,
    });

    // Captured/custom fields changed → the funnel re-checks BANT qualification.
    if (dto.custom_fields !== undefined) {
      this.rmqClient?.emit(RABBITMQ_QUEUES.CONTACT_DATA_CAPTURED, {
        organization_id: organizationId,
        contact_id: id,
      });
    }

    void this.webhookDispatcher?.dispatch('contact.updated', organizationId, { contact_id: id });
    return saved;
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.findById(id, organizationId);
    await this.contactRepo.delete({ id, organization_id: organizationId });
  }

  // ── Activity timeline ────────────────────────────────────────────────
  // Messages anchor the page. They're the overwhelming majority of real
  // content, so this fetches `limit` of them first, then bounds every
  // secondary event type (calls, appointments, funnel changes, data updates)
  // to that same time window instead of giving each its own independent
  // `limit` — the previous approach let a burst of automation bookkeeping
  // (e.g. the Follow-up Engine recreating its "no_response" reminder on every
  // reply) fill its own full quota and crowd real messages out of the final
  // merged-and-sliced page. A contact with no conversations yet (so no
  // messages to bound by) falls back to giving each secondary type its own
  // `limit`, same as before, so those events still surface on their own.
  async getActivity(
    id: string,
    organizationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<ActivityPage> {
    await this.findById(id, organizationId);

    const cursorDate = cursor ? new Date(cursor) : new Date();

    // Query conversations for this contact to get conversation IDs
    const conversations = await this.conversationRepo.find({
      where: { organization_id: organizationId, contact_id: id },
      select: ['id'],
    });
    const conversationIds = conversations.map((c) => c.id);

    // Messages
    let messages: MessageEntity[] = [];
    if (conversationIds.length > 0) {
      messages = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.conversation_id IN (:...ids)', { ids: conversationIds })
        .andWhere('m.organization_id = :orgId', { orgId: organizationId })
        .andWhere('m.sent_at < :cursor', { cursor: cursorDate })
        .orderBy('m.sent_at', 'DESC')
        .take(limit)
        .getMany();
    }

    // A full page of messages means there's more message history further
    // back — bound secondary queries to that window. Fewer than a full page
    // means we've reached the actual start of this contact's messages, so
    // there's no window to bound by; fall back to each type's own budget so
    // anything older (e.g. a call before the first text) still shows up.
    const hasFullMessagePage = messages.length === limit && messages.length > 0;
    const windowStart = hasFullMessagePage ? messages[messages.length - 1].sent_at : null;
    // Only binds in the (rare) case a secondary type is itself dense within
    // the message window — the window is what normally bounds these.
    const secondaryLimit = limit * 5;

    // Voice calls
    // Filtered and ordered on the same expression the event is timestamped
    // with, otherwise a call whose started_at differs from created_at lands out
    // of order or is skipped when the cursor moves past it.
    let callsQb = this.callRepo
      .createQueryBuilder('c')
      .where('c.contact_id = :id', { id })
      .andWhere('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('COALESCE(c.started_at, c.created_at) < :cursor', { cursor: cursorDate });
    if (windowStart) {
      callsQb = callsQb.andWhere('COALESCE(c.started_at, c.created_at) >= :windowStart', { windowStart });
    }
    const calls = await callsQb
      .orderBy('COALESCE(c.started_at, c.created_at)', 'DESC')
      .take(windowStart ? secondaryLimit : limit)
      .getMany();

    // Appointments — join user to resolve actor name; use created_at for timestamp
    let appointmentsQb = this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoin(UserEntity, 'u', 'u.id = a.created_by')
      .addSelect('u.full_name', 'actor_name')
      .where('a.contact_id = :id', { id })
      .andWhere('a.organization_id = :orgId', { orgId: organizationId })
      .andWhere('a.created_at < :cursor', { cursor: cursorDate });
    if (windowStart) {
      appointmentsQb = appointmentsQb.andWhere('a.created_at >= :windowStart', { windowStart });
    }
    const appointmentRaw = await appointmentsQb
      .orderBy('a.created_at', 'DESC')
      .take(windowStart ? secondaryLimit : limit)
      .getRawMany<{
        a_id: string;
        a_created_at: Date;
        a_title: string;
        a_status: string;
        a_origin: string;
        a_created_by: string | null;
        actor_name: string | null;
      }>();

    // Contact data updates
    let dataUpdatesQb = this.dataUpdateRepo
      .createQueryBuilder('d')
      .where('d.contact_id = :id', { id })
      .andWhere('d.organization_id = :orgId', { orgId: organizationId })
      .andWhere('d.created_at < :cursor', { cursor: cursorDate });
    if (windowStart) {
      dataUpdatesQb = dataUpdatesQb.andWhere('d.created_at >= :windowStart', { windowStart });
    }
    const dataUpdates = await dataUpdatesQb
      .orderBy('d.created_at', 'DESC')
      .take(windowStart ? secondaryLimit : limit)
      .getMany();

    // Funnel history — join user to resolve actor name
    let historyQb = this.historyRepo
      .createQueryBuilder('h')
      .leftJoin(FunnelStageEntity, 'fs', 'fs.id = h.from_stage_id')
      .leftJoin(FunnelStageEntity, 'ts', 'ts.id = h.to_stage_id')
      .leftJoin(UserEntity, 'u', 'u.id = h.changed_by')
      .addSelect('fs.name', 'from_name')
      .addSelect('ts.name', 'to_name')
      .addSelect('u.full_name', 'actor_name')
      .where('h.contact_id = :id', { id })
      .andWhere('h.created_at < :cursor', { cursor: cursorDate });
    if (windowStart) {
      historyQb = historyQb.andWhere('h.created_at >= :windowStart', { windowStart });
    }
    const history = await historyQb
      .orderBy('h.created_at', 'DESC')
      .take(windowStart ? secondaryLimit : limit)
      .getRawMany<{
        h_id: string;
        h_created_at: Date;
        h_changed_by: string | null;
        from_name: string | null;
        to_name: string | null;
        actor_name: string | null;
      }>();

    // Merge and sort. System messages (handoff, captured data, etc.) are
    // timeline events, not bubbles — except voice, which CallEntity already
    // covers as voice_call and would otherwise duplicate.
    const messageEvents: ActivityEvent[] = messages.flatMap((m): ActivityEvent[] => {
      const timestamp = m.sent_at.toISOString();
      const isSystem = m.type === 'system' || m.sender_type === 'system';
      if (isSystem && m.channel === 'voice') return [];
      if (isSystem) {
        return [{ type: 'system_event' as const, id: m.id, content: m.content, timestamp }];
      }
      return [{
        type: 'message' as const,
        id: m.id,
        content: m.content,
        sender: m.sender_type === 'user' ? 'contact' : m.sender_type === 'ai' ? 'ai' : 'agent',
        channel: m.channel,
        timestamp,
        direction: m.direction as 'inbound' | 'outbound',
        sender_type: m.sender_type,
        message_type: m.type,
        metadata: m.metadata,
      }];
    });

    const callEvents: ActivityEvent[] = calls.map((c) => ({
      type: 'voice_call' as const,
      id: c.id,
      duration: c.duration_seconds ?? 0,
      call_status: c.status,
      direction: c.direction,
      recording_url: c.recording_url,
      timestamp: (c.started_at ?? c.created_at).toISOString(),
    }));

    const appointmentEvents: ActivityEvent[] = appointmentRaw.map((a) => ({
      type: 'appointment_event' as const,
      id: a.a_id,
      action: `Appointment ${a.a_status}`,
      appointment_id: a.a_id,
      title: a.a_title,
      status: a.a_status,
      actor: a.actor_name ?? (a.a_origin === 'ai' ? 'AI' : null),
      timestamp: new Date(a.a_created_at).toISOString(),
    }));

    const funnelEvents: ActivityEvent[] = history.map((h) => ({
      type: 'funnel_change' as const,
      id: h.h_id,
      from_stage: h.from_name ?? 'Unknown',
      to_stage: h.to_name ?? 'Unknown',
      actor: h.actor_name ?? (h.h_changed_by ? 'Agent' : 'System'),
      timestamp: h.h_created_at.toISOString(),
    }));

    const dataUpdateEvents: ActivityEvent[] = dataUpdates.map((d) => ({
      type: 'contact_data_updated' as const,
      id: d.id,
      changed_fields: d.changed_fields,
      timestamp: d.created_at.toISOString(),
    }));

    // No arbitrary final slice — messages are already capped at `limit`, and
    // every secondary type is bounded by that same message window (or by its
    // own `limit` in the no-messages-yet fallback), so nothing here needs
    // truncating a second time. That second truncation was the actual bug:
    // slicing the merged, mixed-type list to `limit` let a burst of one event
    // type (e.g. automation appointments) push real messages off the page.
    const merged = [...messageEvents, ...callEvents, ...appointmentEvents, ...funnelEvents, ...dataUpdateEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const next_cursor = hasFullMessagePage ? windowStart!.toISOString() : null;

    return { events: merged, next_cursor };
  }

  // ── Tags ─────────────────────────────────────────────────────────────
  async addTag(id: string, organizationId: string, tag: string): Promise<ContactEntity> {
    const contact = await this.findById(id, organizationId);
    const tags = contact.tags ?? [];
    if (!tags.includes(tag)) {
      contact.tags = [...tags, tag];
      return this.contactRepo.save(contact);
    }
    return contact;
  }

  async removeTag(id: string, organizationId: string, tagId: string): Promise<void> {
    const contact = await this.findById(id, organizationId);
    contact.tags = (contact.tags ?? []).filter((t) => t !== tagId);
    await this.contactRepo.save(contact);
  }

  // ── Captured data (stored in custom_fields) ──────────────────────────
  getCapturedData(id: string, organizationId: string) {
    return this.findById(id, organizationId).then((c) => ({
      fields: (c.custom_fields as Record<string, string>) ?? {},
    }));
  }

  async updateCapturedData(
    id: string,
    organizationId: string,
    fields: Record<string, string>,
  ) {
    const contact = await this.findById(id, organizationId);
    contact.custom_fields = { ...(contact.custom_fields ?? {}), ...fields };
    this.applyLeadScoreSignals(contact);
    await this.contactRepo.save(contact);
    this.rmqClient?.emit(RABBITMQ_QUEUES.CONTACT_DATA_CAPTURED, {
      organization_id: organizationId,
      contact_id: id,
    });
    return { fields: contact.custom_fields as Record<string, string> };
  }

  /**
   * Recomputes lead_score from captured-data signals: urgency (tiered, not
   * binary) plus BANT completeness (10 pts/field, same 4 keys the "Qualified
   * (BANT)" funnel rule checks — see funnel-rules.service.ts). Only bumps up,
   * never auto-cools, so a hot lead you're chasing doesn't silently drop; a
   * later decay/rotting pass (Phase 4, not built yet) is the intended way down.
   */
  private applyLeadScoreSignals(contact: ContactEntity): void {
    const fields = (contact.custom_fields as Record<string, unknown>) ?? {};

    const urgency = String(fields.urgency_level ?? '').trim().toLowerCase();
    const urgencyScore = URGENCY_SCORE[urgency] ?? 0;

    let bantScore = 0;
    if (isTruthyField(fields.is_decision_maker)) bantScore += BANT_POINTS;
    if (isTruthyField(fields.has_budget)) bantScore += BANT_POINTS;
    if (isPresentField(fields.timeline)) bantScore += BANT_POINTS;
    if (isPresentField(fields.service_needed)) bantScore += BANT_POINTS;

    const computed = Math.min(100, urgencyScore + bantScore);
    if (computed > (contact.lead_score ?? 0)) {
      contact.lead_score = computed;
    }
  }

  // ── Lead stage ───────────────────────────────────────────────────────
  async updateStage(
    id: string,
    organizationId: string,
    stageId: string,
    changedBy?: string,
    source: 'manual' | 'automation' = 'manual',
    reason?: string,
  ): Promise<ContactEntity> {
    const contact = await this.findById(id, organizationId);
    const oldStageId = contact.lead_stage ?? null;

    // No-op save (same stage re-selected/re-dropped) must not count as a real
    // move: it was still writing a 'manual' history row, which silently armed
    // the 24h anti-override guard in FunnelRulesService and froze automation
    // for a contact nobody actually decided to override.
    if (oldStageId === stageId) return contact;

    contact.lead_stage = stageId;
    await this.contactRepo.save(contact);

    // Fire-and-forget history log
    void this.historyRepo.save(
      this.historyRepo.create({
        contact_id: id,
        from_stage_id: oldStageId,
        to_stage_id: stageId,
        changed_by: changedBy ?? null,
        source,
        reason: reason ?? null,
      }),
    );

    this.rmqClient?.emit(RABBITMQ_QUEUES.CONTACT_STAGE_CHANGED, {
      organization_id: organizationId,
      contact_id: id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      from_stage_id: oldStageId,
      to_stage_id: stageId,
    });

    void this.webhookDispatcher?.dispatch('funnel.stage.changed', organizationId, {
      contact_id: id,
      from_stage_id: oldStageId,
      to_stage_id: stageId,
    });

    return contact;
  }

  // ── Contact sub-resources ─────────────────────────────────────────────
  async getContactConversations(id: string, orgId: string) {
    await this.findById(id, orgId);
    const conversations = await this.conversationRepo.find({
      where: { organization_id: orgId, contact_id: id },
      order: { last_message_at: 'DESC' },
      take: 10,
    });
    return { total: conversations.length, conversations };
  }

  async getContactCalls(id: string, orgId: string, limit = 10, offset = 0) {
    await this.findById(id, orgId);
    const [calls, total] = await this.callRepo.findAndCount({
      where: { organization_id: orgId, contact_id: id },
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { total, calls };
  }

  async getContactAppointments(id: string, orgId: string) {
    await this.findById(id, orgId);
    return this.appointmentRepo.find({
      where: { organization_id: orgId, contact_id: id },
      order: { starts_at: 'DESC' },
      take: 20,
    });
  }

  async updateLastContacted(id: string, organizationId: string, date: Date): Promise<void> {
    await this.contactRepo.update(
      { id, organization_id: organizationId },
      { last_contacted_at: date },
    );
  }

  /**
   * Resolve a contact from a channel identifier. Phone-based channels also
   * match on any other phone channel and on the `phone` column, comparing the
   * digits only — see {@link phoneMatchKey}.
   */
  private async findByChannelIdentifier(
    orgId: string,
    channel: string,
    identifier: string,
  ): Promise<ContactEntity | null> {
    const qb = this.contactRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId });

    const phoneKey = PHONE_CHANNELS.includes(channel) ? phoneMatchKey(identifier) : null;

    if (!phoneKey) {
      return qb
        .andWhere('c.channel_ids ->> :channel = :identifier', { channel, identifier })
        .getOne();
    }

    // Exact hit first so an unambiguous match always wins over a digits match.
    const exact = await this.contactRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId })
      .andWhere('c.channel_ids ->> :channel = :identifier', { channel, identifier })
      .getOne();
    if (exact) return exact;

    const digitsExpr = (col: string) =>
      `RIGHT(REGEXP_REPLACE(COALESCE(${col}, ''), '[^0-9]', '', 'g'), 10)`;

    return qb
      .andWhere(
        `(${digitsExpr('c.phone')} = :phoneKey OR ${PHONE_CHANNELS.map(
          (ch) => `${digitsExpr(`c.channel_ids ->> '${ch}'`)} = :phoneKey`,
        ).join(' OR ')})`,
        { phoneKey },
      )
      .orderBy('c.created_at', 'ASC')
      .getOne();
  }

  async findOrCreateByChannel(
    orgId: string,
    channel: string,
    identifier: string,
    displayName?: string,
  ): Promise<ContactEntity> {
    const isPhoneChannel = PHONE_CHANNELS.includes(channel);

    // For phone channels, use atomic INSERT ... ON CONFLICT to prevent race conditions
    if (isPhoneChannel) {
      return this.findOrCreatePhoneContact(orgId, channel, identifier, displayName);
    }

    // For non-phone channels (email, webchat, instagram), keep the existing logic
    const existing = await this.findByChannelIdentifier(orgId, channel, identifier);

    if (existing) {
      let dirty = false;

      if (displayName && (!existing.first_name || existing.first_name === '')) {
        existing.first_name = displayName;
        dirty = true;
      }

      if (existing.channel_ids?.[channel] !== identifier) {
        existing.channel_ids = { ...(existing.channel_ids ?? {}), [channel]: identifier };
        dirty = true;
      }

      if (dirty) await this.contactRepo.save(existing);
      return existing;
    }

    const defaultStage = await this.resolveDefaultStage(orgId);

    return this.contactRepo.save(
      this.contactRepo.create({
        organization_id: orgId,
        first_name: displayName ?? '',
        email: channel === ChannelType.EMAIL ? identifier : undefined,
        phone: undefined,
        channel_ids: { [channel]: identifier },
        status: 'active',
        metadata: {},
        lead_stage: defaultStage ?? undefined,
      }),
    );
  }

  /**
   * Atomic phone contact creation using INSERT ... ON CONFLICT.
   * Prevents race conditions when multiple webhook events for the same call
   * run concurrently in BullMQ.
   */
  private async findOrCreatePhoneContact(
    orgId: string,
    channel: string,
    phoneNumber: string,
    displayName?: string,
  ): Promise<ContactEntity> {
    const defaultStage = await this.resolveDefaultStage(orgId);

    // INSERT ... ON CONFLICT using the unique index on (org_id, normalized_phone)
    // If a conflict occurs, DO NOTHING and return the existing row
    const result = await this.contactRepo.manager.query(
      `
      INSERT INTO clients.contacts (
        organization_id,
        first_name,
        phone,
        channel_ids,
        status,
        metadata,
        lead_stage,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4::jsonb,
        'active',
        '{}'::jsonb,
        $5,
        NOW(),
        NOW()
      )
      ON CONFLICT (
        organization_id,
        RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
      )
      WHERE phone IS NOT NULL AND phone <> ''
      DO NOTHING
      RETURNING *;
      `,
      [
        orgId,
        displayName ?? '',
        phoneNumber,
        JSON.stringify({ [channel]: phoneNumber }),
        defaultStage ?? null,
      ],
    );

    // If INSERT succeeded (no conflict), return the new contact
    if (result.length > 0) {
      return this.contactRepo.create(result[0]);
    }

    // If conflict occurred (DO NOTHING), fetch the existing contact
    // Use findByChannelIdentifier which handles all phone normalization logic
    const existing = await this.findByChannelIdentifier(orgId, channel, phoneNumber);
    
    if (!existing) {
      // Should never happen, but handle gracefully
      throw new Error(
        `Contact should exist after INSERT conflict for org=${orgId} phone=${phoneNumber}`,
      );
    }

    // Update display name if empty and provided
    let dirty = false;
    if (displayName && (!existing.first_name || existing.first_name === '')) {
      existing.first_name = displayName;
      dirty = true;
    }

    // Record this spelling/channel if not already present
    if (existing.channel_ids?.[channel] !== phoneNumber) {
      existing.channel_ids = { ...(existing.channel_ids ?? {}), [channel]: phoneNumber };
      dirty = true;
    }

    if (dirty) {
      await this.contactRepo.save(existing);
    }

    return existing;
  }
}
