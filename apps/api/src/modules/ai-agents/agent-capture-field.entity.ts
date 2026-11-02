import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { AIAgentEntity } from './ai-agent.entity';

@Entity({ name: 'agent_capture_fields', schema: 'agents' })
@Index(['agent_id'])
@Index(['organization_id'])
export class AgentCaptureFieldEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  agent_id: string;

  @ManyToOne(() => AIAgentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: AIAgentEntity;

  @Column({ length: 100 })
  field_name: string;

  @Column({ length: 255 })
  field_label: string;

  @Column({ length: 50, default: 'text' })
  field_type: string;

  @Column({ default: false })
  required: boolean;

  @Column({ default: 0 })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
