import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { UserEntity } from './user.entity';
import { SUPABASE_ADMIN_CLIENT } from '../../infrastructure/supabase/supabase-admin.constants';
import { userAuthCacheKey } from './users.constants';
import type { InviteUserDto } from './dto/invite-user.dto';
import type { AcceptInviteDto } from './dto/accept-invite.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

export const DUPLICATE_MEMBER_MESSAGE = 'A member with this email already exists in this organization';
export const EXISTING_ACCOUNT_MESSAGE =
  'This email already has an account. Existing accounts must be added to an organization manually.';

interface AuthProviderError {
  message?: string;
  status?: number;
  code?: string;
}

interface InvitationMetadata {
  status: 'pending' | 'accepted';
  invited_by: string | null;
  invited_at: string;
  accepted_at?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly inviteRedirectUrl: string;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabaseAdmin: SupabaseClient | null,
    private readonly config: ConfigService,
  ) {
    const webUrl =
      this.config.get<string>('FRONTEND_URL') ||
      this.config.get<string>('NEXT_PUBLIC_WEB_URL') ||
      'http://localhost:3000';
    this.inviteRedirectUrl = `${webUrl.replace(/\/+$/, '')}/accept-invite`;
  }

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

  /**
   * The Supabase account is created and linked to the member row BEFORE the
   * invite email is sent, so the invitee's first authenticated request resolves
   * to this row and TenantContextMiddleware never auto-provisions a new org.
   */
  async invite(
    organizationId: string,
    invitedBy: string | null,
    dto: InviteUserDto,
  ): Promise<UserEntity> {
    if (!this.supabaseAdmin) {
      throw new ServiceUnavailableException('Invitations are not configured');
    }
    const supabaseAdmin = this.supabaseAdmin;
    const email = dto.email.trim().toLowerCase();

    const sameEmail = await this.repo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .getMany();
    if (sameEmail.some((u) => u.organization_id === organizationId)) {
      throw new ConflictException(DUPLICATE_MEMBER_MESSAGE);
    }
    if (sameEmail.length > 0) {
      throw new ConflictException(EXISTING_ACCOUNT_MESSAGE);
    }

    const invitation: InvitationMetadata = {
      status: 'pending',
      invited_by: invitedBy,
      invited_at: new Date().toISOString(),
    };

    let user: UserEntity;
    try {
      user = await this.repo.save(
        this.repo.create({
          organization_id: organizationId,
          email,
          full_name: email.split('@')[0],
          role: dto.role,
          metadata: { invitation },
        }),
      );
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException(DUPLICATE_MEMBER_MESSAGE);
      }
      throw err;
    }

    let authUserId: string | null = null;
    try {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { invited_to_organization_id: organizationId },
      });
      if (created.error || !created.data.user) {
        throw this.toInviteError(created.error, 'create the account');
      }
      authUserId = created.data.user.id;

      await this.repo.update({ id: user.id, organization_id: organizationId }, { auth_user_id: authUserId });
      user.auth_user_id = authUserId;

      const sent = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: this.inviteRedirectUrl,
      });
      if (sent.error) {
        throw this.toInviteError(sent.error, 'send the invitation email');
      }
    } catch (err) {
      await this.rollbackInvite(user, authUserId);
      throw err;
    }

    return user;
  }

  async acceptInvite(userId: string, organizationId: string, dto: AcceptInviteDto): Promise<UserEntity> {
    const user = await this.findById(userId, organizationId);
    const invitation = user.metadata?.invitation as InvitationMetadata | undefined;

    if (!invitation) throw new BadRequestException('No pending invitation for this account');
    if (invitation.status === 'accepted') return user;

    user.metadata = {
      ...user.metadata,
      invitation: { ...invitation, status: 'accepted', accepted_at: new Date().toISOString() },
    };
    if (dto.full_name) user.full_name = dto.full_name;
    return this.repo.save(user);
  }

  async update(id: string, organizationId: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.findById(id, organizationId);
    const accessChanged =
      (dto.role !== undefined && dto.role !== user.role) ||
      (dto.is_active !== undefined && dto.is_active !== user.is_active);

    Object.assign(user, dto);
    const saved = await this.repo.save(user);

    if (accessChanged && saved.auth_user_id) {
      await this.redis.del(userAuthCacheKey(saved.auth_user_id));
    }
    return saved;
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.repo.update(id, { last_seen_at: new Date() });
  }

  private toInviteError(error: AuthProviderError | null, action: string): HttpException {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
      return new ConflictException(EXISTING_ACCOUNT_MESSAGE);
    }
    this.logger.error(`Supabase failed to ${action}: [${error?.status} ${error?.code}] ${error?.message}`);
    if (error?.status === HttpStatus.TOO_MANY_REQUESTS) {
      return new HttpException('Too many invitations sent. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error?.status && error.status >= 400 && error.status < 500 && error.message) {
      return new BadRequestException(error.message);
    }
    return new BadGatewayException(`Could not ${action}. Try again later.`);
  }

  private async rollbackInvite(user: UserEntity, authUserId: string | null): Promise<void> {
    if (authUserId && this.supabaseAdmin) {
      const { error } = await this.supabaseAdmin.auth.admin
        .deleteUser(authUserId)
        .catch((err: Error) => ({ error: err }));
      if (error) {
        this.logger.error(
          `Invite rollback: could not delete Supabase user ${authUserId} (${user.email}): ${error.message}`,
        );
      }
    }
    await this.repo.delete({ id: user.id, organization_id: user.organization_id }).catch((err: Error) => {
      this.logger.error(`Invite rollback: could not delete member ${user.id} (${user.email}): ${err.message}`);
    });
  }
}
