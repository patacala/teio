import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'ai_agents', schema: 'agents' })
@Index(['organization_id', 'status'])
export class AIAgentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50, default: 'openai' })
  provider: string;

  @Column({ length: 100, default: 'gpt-4o' })
  model: string;

  @Column({ type: 'text', default: '' })
  system_prompt: string;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0.7 })
  temperature: number;

  @Column({ default: 1000 })
  max_tokens: number;

  @Column({ length: 50, default: 'inactive' })
  status: string;

  @Column({ type: 'text', array: true, default: '{}' })
  channels: string[];

  @Column({ length: 100, default: 'assistant' })
  role: string;

  @Column({ length: 50, default: 'professional' })
  tone: string;

  @Column({ type: 'text', nullable: true })
  welcome_message: string;

  @Column({ type: 'text', nullable: true })
  fallback_message: string;

  @Column({ type: 'text', nullable: true })
  apology_message: string;

  @Column({ type: 'text', array: true, default: '{}' })
  transfer_keywords: string[];

  @Column({ type: 'jsonb', default: {} })
  escalation_rules: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  knowledge_base: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  tools_config: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
