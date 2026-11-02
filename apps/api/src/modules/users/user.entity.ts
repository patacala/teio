import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'users', schema: 'core' })
@Index(['organization_id', 'email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ length: 255, unique: true, nullable: true })
  auth_user_id: string;

  @Column({ length: 320 })
  email: string;

  @Column({ length: 255 })
  full_name: string;

  @Column({ nullable: true })
  avatar_url: string;

  @Column({ length: 50, default: 'agent' })
  role: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_platform_admin: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_seen_at: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
