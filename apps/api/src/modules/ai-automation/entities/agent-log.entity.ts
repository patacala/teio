import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { AutomationAgentEntity } from './automation-agent.entity';

@Entity({ name: 'agent_logs', schema: 'ai_agents' })
@Index(['agent_id', 'created_at'])
@Index(['organization_id', 'created_at'])
export class AgentLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid' })
  agent_id: string;

  @ManyToOne(() => AutomationAgentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent: AutomationAgentEntity;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  @Column({ length: 100 })
  event_type: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
