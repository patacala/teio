import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageTemplateEntity } from './message-template.entity';

export interface CreateTemplateDto {
  name: string;
  content: string;
  channel?: string;
  variables?: string[];
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(MessageTemplateEntity)
    private readonly templateRepo: Repository<MessageTemplateEntity>,
  ) {}

  getTemplates(organizationId: string, channel?: string): Promise<MessageTemplateEntity[]> {
    const where: Record<string, unknown> = { organization_id: organizationId };
    if (channel && channel !== 'all') where['channel'] = channel;
    return this.templateRepo.find({ where, order: { name: 'ASC' } });
  }

  createTemplate(organizationId: string, dto: CreateTemplateDto): Promise<MessageTemplateEntity> {
    return this.templateRepo.save(
      this.templateRepo.create({ organization_id: organizationId, ...dto }),
    );
  }

  async updateTemplate(id: string, organizationId: string, dto: Partial<CreateTemplateDto>): Promise<MessageTemplateEntity> {
    const tpl = await this.templateRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    Object.assign(tpl, dto);
    return this.templateRepo.save(tpl);
  }

  async deleteTemplate(id: string, organizationId: string): Promise<void> {
    const tpl = await this.templateRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    await this.templateRepo.delete({ id });
  }
}
