import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { AutomationAgentEntity } from './automation-agent.entity';
import { AgentToolEntity } from './agent-tool.entity';

@Entity({ name: 'agent_tool_executions', schema: 'ai_agents' })
@Index(['agent_id', 'created_at'])
@Index(['organization_id', 'created_at'])
@Check(`"status" IN ('pending','success','failed')`)
export class AgentToolExecutionEntity {
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
  tool_id: string | null;

  @ManyToOne(() => AgentToolEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tool_id' })
  tool: AgentToolEntity | null;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  @Column({ type: 'jsonb', default: {} })
  input: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  result: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'success' | 'failed';

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
