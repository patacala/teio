import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIAgentEntity } from './ai-agent.entity';
import { AgentCaptureFieldEntity } from './agent-capture-field.entity';
import { ProsalesClientService } from './prosales-client.service';

export interface CreateAIAgentDto {
  name: string;
  description?: string;
  provider?: string;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  channels?: string[];
  role?: string;
  tone?: string;
  welcome_message?: string;
  fallback_message?: string;
  apology_message?: string;
  transfer_keywords?: string[];
  escalation_rules?: Record<string, unknown>;
  knowledge_base?: Record<string, unknown>;
  tools_config?: Record<string, unknown>;
}

export interface UpdateAIAgentDto {
  name?: string;
  description?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  status?: string;
  channels?: string[];
  role?: string;
  tone?: string;
  welcome_message?: string;
  fallback_message?: string;
  apology_message?: string;
  transfer_keywords?: string[];
  escalation_rules?: Record<string, unknown>;
  knowledge_base?: Record<string, unknown>;
  tools_config?: Record<string, unknown>;
}

export interface CreateCaptureFieldDto {
  field_name: string;
  field_label: string;
  field_type?: string;
  required?: boolean;
  position?: number;
}

export interface UpdateCaptureFieldDto {
  field_label?: string;
  field_type?: string;
  required?: boolean;
  position?: number;
}

/**
 * NOTE (2026-09-27): this module is mid-migration. The config UI at
 * /config/agents now edits ProSales' identity/personality/rules/strategies/
 * knowledge directly (see the `get/update*`/knowledge methods below, proxied
 * via ProsalesClientService — one agent per org, see crm-integration-2026-09
 * memory). The `AIAgentEntity`/capture-fields methods below are the OLD,
 * disconnected config store (see CLAUDE.md) — kept alive only because
 * useCaptureFieldLabels (contacts/Kanban labeling) still reads them. Not
 * wired to any real conversational behavior; do not extend, only preserve
 * for that one remaining reader until it's migrated off too.
 */
@Injectable()
export class AIAgentsService {
  constructor(
    @InjectRepository(AIAgentEntity)
    private readonly repo: Repository<AIAgentEntity>,
    @InjectRepository(AgentCaptureFieldEntity)
    private readonly captureRepo: Repository<AgentCaptureFieldEntity>,
    private readonly prosales: ProsalesClientService,
  ) {}

  // --- ProSales-backed agent config (the real thing) ---

  provisionAgent(orgId: string, agentType?: string) {
    return this.prosales.provisionAgent(orgId, agentType);
  }

  getConfig(orgId: string) {
    return this.prosales.getConfig(orgId);
  }

  configureFromBrief(orgId: string, brief: string) {
    return this.prosales.configureFromBrief(orgId, brief);
  }

  updateIdentity(orgId: string, payload: unknown) {
    return this.prosales.updateIdentity(orgId, payload);
  }

  updatePersonality(orgId: string, payload: unknown) {
    return this.prosales.updatePersonality(orgId, payload);
  }

  updateRules(orgId: string, payload: unknown) {
    return this.prosales.updateRules(orgId, payload);
  }

  updateStrategies(orgId: string, payload: unknown) {
    return this.prosales.updateStrategies(orgId, payload);
  }

  updateQualification(orgId: string, payload: unknown) {
    return this.prosales.updateQualification(orgId, payload);
  }

  // --- Legacy (agents.ai_agents) — kept only for useCaptureFieldLabels ---

  async findAll(organizationId: string): Promise<AIAgentEntity[]> {
    return this.repo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string, organizationId: string): Promise<AIAgentEntity> {
    const agent = await this.repo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!agent) throw new NotFoundException(`AI Agent ${id} not found`);
    return agent;
  }

  async create(organizationId: string, userId: string, dto: CreateAIAgentDto): Promise<AIAgentEntity> {
    const agent = this.repo.create({
      organization_id: organizationId,
      created_by: userId,
      provider: dto.provider ?? 'openai',
      model: dto.model ?? 'gpt-4o',
      system_prompt: dto.system_prompt ?? '',
      temperature: dto.temperature ?? 0.7,
      max_tokens: dto.max_tokens ?? 1000,
      channels: dto.channels ?? [],
      transfer_keywords: dto.transfer_keywords ?? [],
      escalation_rules: dto.escalation_rules ?? {},
      knowledge_base: dto.knowledge_base ?? {},
      tools_config: dto.tools_config ?? {},
      ...dto,
    });
    return this.repo.save(agent);
  }

  async update(id: string, organizationId: string, dto: UpdateAIAgentDto): Promise<AIAgentEntity> {
    const agent = await this.findById(id, organizationId);
    Object.assign(agent, dto);
    return this.repo.save(agent);
  }

  async activate(id: string, organizationId: string): Promise<AIAgentEntity> {
    return this.update(id, organizationId, { status: 'active' });
  }

  async deactivate(id: string, organizationId: string): Promise<AIAgentEntity> {
    return this.update(id, organizationId, { status: 'inactive' });
  }

  // --- Capture Fields ---

  async getCaptureFields(agentId: string, orgId: string): Promise<AgentCaptureFieldEntity[]> {
    return this.captureRepo.find({
      where: { agent_id: agentId, organization_id: orgId },
      order: { position: 'ASC' },
    });
  }

  async createCaptureField(
    agentId: string,
    orgId: string,
    dto: CreateCaptureFieldDto,
  ): Promise<AgentCaptureFieldEntity> {
    await this.findById(agentId, orgId);
    const field = this.captureRepo.create({
      agent_id: agentId,
      organization_id: orgId,
      field_type: 'text',
      required: false,
      position: 0,
      ...dto,
    });
    return this.captureRepo.save(field);
  }

  async updateCaptureField(
    fieldId: string,
    orgId: string,
    dto: UpdateCaptureFieldDto,
  ): Promise<AgentCaptureFieldEntity> {
    const field = await this.captureRepo.findOne({
      where: { id: fieldId, organization_id: orgId },
    });
    if (!field) throw new NotFoundException(`Capture field ${fieldId} not found`);
    Object.assign(field, dto);
    return this.captureRepo.save(field);
  }

  async deleteCaptureField(fieldId: string, orgId: string): Promise<void> {
    const field = await this.captureRepo.findOne({
      where: { id: fieldId, organization_id: orgId },
    });
    if (!field) throw new NotFoundException(`Capture field ${fieldId} not found`);
    await this.captureRepo.delete(fieldId);
  }

  async reorderCaptureFields(
    agentId: string,
    orgId: string,
    orderedIds: string[],
  ): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) =>
        this.captureRepo.update(
          { id, agent_id: agentId, organization_id: orgId },
          { position: index },
        ),
      ),
    );
  }
}
