import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelEntity } from './funnel.entity';
import { FunnelStageEntity } from './funnel-stage.entity';
import { FunnelTemplateEntity } from './funnel-template.entity';

export interface CreateFunnelDto {
  name: string;
}

export interface CreateFunnelStageDto {
  name: string;
  color?: string;
  position?: number;
  /** Portable semantics for automation rules (new/contacted/qualified/… ). Defaults to 'custom'. */
  stage_type?: string;
  is_terminal?: boolean;
  rotting_days?: number | null;
}

export interface UpdateFunnelStageDto {
  name?: string;
  color?: string;
  stage_type?: string;
  is_terminal?: boolean;
  rotting_days?: number | null;
}

@Injectable()
export class FunnelsService {
  constructor(
    @InjectRepository(FunnelEntity)
    private readonly funnelRepo: Repository<FunnelEntity>,
    @InjectRepository(FunnelStageEntity)
    private readonly stageRepo: Repository<FunnelStageEntity>,
    @InjectRepository(FunnelTemplateEntity)
    private readonly templateRepo: Repository<FunnelTemplateEntity>,
  ) {}

  // ── Funnels ─────────────────────────────────────────────────────────────

  getFunnels(organizationId: string): Promise<FunnelEntity[]> {
    return this.funnelRepo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async getFunnel(id: string, organizationId: string): Promise<FunnelEntity> {
    const funnel = await this.funnelRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!funnel) throw new NotFoundException(`Funnel ${id} not found`);
    return funnel;
  }

  async createFunnel(organizationId: string, dto: CreateFunnelDto): Promise<FunnelEntity> {
    return this.funnelRepo.save(
      this.funnelRepo.create({ organization_id: organizationId, name: dto.name }),
    );
  }

  // ── Stages ───────────────────────────────────────────────────────────────

  async getAllStagesForOrg(organizationId: string): Promise<FunnelStageEntity[]> {
    return this.stageRepo
      .createQueryBuilder('s')
      .innerJoin(FunnelEntity, 'f', 'f.id = s.funnel_id')
      .where('f.organization_id = :orgId', { orgId: organizationId })
      .orderBy('f.created_at', 'ASC')
      .addOrderBy('s.position', 'ASC')
      .getMany();
  }

  async getStages(funnelId: string, organizationId: string): Promise<FunnelStageEntity[]> {
    await this.getFunnel(funnelId, organizationId);
    return this.stageRepo.find({
      where: { funnel_id: funnelId },
      order: { position: 'ASC' },
    });
  }

  async createStage(
    funnelId: string,
    organizationId: string,
    dto: CreateFunnelStageDto,
  ): Promise<FunnelStageEntity> {
    await this.getFunnel(funnelId, organizationId);
    const count = await this.stageRepo.count({ where: { funnel_id: funnelId } });
    return this.stageRepo.save(
      this.stageRepo.create({
        organization_id: organizationId,
        funnel_id: funnelId,
        name: dto.name,
        color: dto.color,
        position: dto.position ?? count,
        stage_type: dto.stage_type ?? 'custom',
        is_terminal: dto.is_terminal ?? false,
        rotting_days: dto.rotting_days ?? null,
      }),
    );
  }

  async updateStage(
    funnelId: string,
    stageId: string,
    organizationId: string,
    dto: UpdateFunnelStageDto,
  ): Promise<FunnelStageEntity> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, funnel_id: funnelId, organization_id: organizationId },
    });
    if (!stage) throw new NotFoundException(`Stage ${stageId} not found`);
    Object.assign(stage, dto);
    return this.stageRepo.save(stage);
  }

  async deleteStage(funnelId: string, stageId: string, organizationId: string): Promise<void> {
    const stage = await this.stageRepo.findOne({
      where: { id: stageId, funnel_id: funnelId, organization_id: organizationId },
    });
    if (!stage) throw new NotFoundException(`Stage ${stageId} not found`);
    await this.stageRepo.delete({ id: stageId });
  }

  async reorderStages(
    funnelId: string,
    organizationId: string,
    orderedIds: string[],
  ): Promise<void> {
    await this.getFunnel(funnelId, organizationId);
    await Promise.all(
      orderedIds.map((id, index) =>
        this.stageRepo.update({ id, funnel_id: funnelId }, { position: index }),
      ),
    );
  }

  // ── Templates ────────────────────────────────────────────────────────────

  getTemplates(): Promise<FunnelTemplateEntity[]> {
    return this.templateRepo.find({ order: { name: 'ASC' } });
  }

  async applyTemplate(
    organizationId: string,
    templateId: string,
  ): Promise<{ funnel: FunnelEntity; stages: FunnelStageEntity[] }> {
    const template = await this.templateRepo.findOne({ where: { id: templateId } });
    if (!template) throw new NotFoundException(`Template ${templateId} not found`);

    const funnel = await this.createFunnel(organizationId, { name: template.name });

    const sortedStages = [...template.stages].sort((a, b) => a.position - b.position);
    const stages = await Promise.all(
      sortedStages.map((s) =>
        this.stageRepo.save(
          this.stageRepo.create({
            organization_id: organizationId,
            funnel_id: funnel.id,
            name: s.name,
            position: s.position,
            color: s.color,
            stage_type: s.stage_type,
            is_terminal: s.is_terminal,
            rotting_days: s.rotting_days,
          }),
        ),
      ),
    );

    return { funnel, stages };
  }
}
