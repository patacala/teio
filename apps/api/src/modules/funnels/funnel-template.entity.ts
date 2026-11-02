import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
} from 'typeorm';
import type { FunnelTemplateStageEntity } from './funnel-template-stage.entity';

@Entity({ name: 'funnel_templates', schema: 'clients' })
export class FunnelTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 100, default: 'generic' })
  category: string;

  @OneToMany('FunnelTemplateStageEntity', 'template', { eager: true, cascade: true })
  stages: FunnelTemplateStageEntity[];
}
