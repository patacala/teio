import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

export interface CreateUserDto {
  email: string;
  full_name: string;
  role?: string;
  avatar_url?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateUserDto {
  full_name?: string;
  role?: string;
  avatar_url?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  async findAllByOrg(organizationId: string): Promise<UserEntity[]> {
    return this.repo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string, organizationId: string): Promise<UserEntity> {
    const user = await this.repo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByIdUnscoped(id: string): Promise<UserEntity> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string, organizationId: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { email, organization_id: organizationId } });
  }

  async findByAuthUserId(authUserId: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { auth_user_id: authUserId } });
  }

  async findOrCreate(
    authUserId: string,
    email: string,
    organizationId: string,
    role = 'agent',
  ): Promise<UserEntity> {
    const existing = await this.findByAuthUserId(authUserId);
    if (existing) return existing;

    const user = this.repo.create({
      organization_id: organizationId,
      auth_user_id: authUserId,
      email,
      full_name: email.split('@')[0],
      role,
      metadata: {},
    });
    return this.repo.save(user);
  }

  async create(organizationId: string, dto: CreateUserDto): Promise<UserEntity> {
    const user = this.repo.create({
      organization_id: organizationId,
      email: dto.email,
      full_name: dto.full_name,
      role: dto.role ?? 'agent',
      avatar_url: dto.avatar_url,
      metadata: dto.metadata ?? {},
    });
    return this.repo.save(user);
  }

  async update(id: string, organizationId: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.findById(id, organizationId);
    Object.assign(user, dto);
    return this.repo.save(user);
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.repo.update(id, { last_seen_at: new Date() });
  }
}
