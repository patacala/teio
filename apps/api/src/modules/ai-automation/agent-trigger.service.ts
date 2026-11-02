import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationAgentEntity } from './entities/automation-agent.entity';
import { AgentLogEntity } from './entities/agent-log.entity';
import type { CreateAutomationAgentDto, UpdateAutomationAgentDto, CreateAgentToolDto } from './dto/create-automation-agent.dto';
import { AgentToolEntity } from './entities/agent-tool.entity';

@Injectable()
export class AgentTriggerService {
  constructor(
    @InjectRepository(AutomationAgentEntity)
    private readonly agentRepo: Repository<AutomationAgentEntity>,
    @InjectRepository(AgentLogEntity)
    private readonly logRepo: Repository<AgentLogEntity>,
    @InjectRepository(AgentToolEntity)
    private readonly toolRepo: Repository<AgentToolEntity>,
  ) {}

  async findAgentsForEvent(orgId: string, eventType: string): Promise<AutomationAgentEntity[]> {
    return this.agentRepo.find({
      where: { organization_id: orgId, trigger_event: eventType, is_active: true },
    });
  }

  async findAgentById(agentId: string, orgId: string): Promise<AutomationAgentEntity> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, organization_id: orgId },
    });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    return agent;
  }

  async findAll(orgId: string): Promise<AutomationAgentEntity[]> {
    return this.agentRepo.find({
      where: { organization_id: orgId },
      order: { created_at: 'DESC' },
    });
  }

  async create(orgId: string, dto: CreateAutomationAgentDto): Promise<AutomationAgentEntity> {
    const agent = this.agentRepo.create({
      organization_id: orgId,
      name: dto.name,
      description: dto.description ?? null,
      trigger_event: dto.trigger_event,
      workflow_endpoint: dto.workflow_endpoint,
      auth_header_value: dto.auth_header_value ?? null,
      is_active: dto.is_active ?? true,
    });
    return this.agentRepo.save(agent);
  }

  async update(agentId: string, orgId: string, dto: UpdateAutomationAgentDto): Promise<AutomationAgentEntity> {
    const agent = await this.findAgentById(agentId, orgId);
    Object.assign(agent, dto);
    return this.agentRepo.save(agent);
  }

  async deactivate(agentId: string, orgId: string): Promise<AutomationAgentEntity> {
    const agent = await this.findAgentById(agentId, orgId);
    agent.is_active = false;
    return this.agentRepo.save(agent);
  }

  async log(
    orgId: string,
    agentId: string,
    conversationId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        organization_id: orgId,
        agent_id: agentId,
        conversation_id: conversationId,
        event_type: eventType,
        payload,
      }),
    );
  }

  // ── Tool management ──────────────────────────────────────────────────────────

  async findTools(orgId: string): Promise<AgentToolEntity[]> {
    return this.toolRepo.find({
      where: { organization_id: orgId },
      order: { name: 'ASC' },
    });
  }

  async findToolByName(name: string, orgId: string): Promise<AgentToolEntity | null> {
    return this.toolRepo.findOne({ where: { name, organization_id: orgId } });
  }

  async createTool(orgId: string, dto: CreateAgentToolDto): Promise<AgentToolEntity> {
    const tool = this.toolRepo.create({
      organization_id: orgId,
      name: dto.name,
      description: dto.description ?? null,
      endpoint: dto.endpoint ?? null,
    });
    return this.toolRepo.save(tool);
  }
}
