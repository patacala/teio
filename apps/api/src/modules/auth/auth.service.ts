import { Injectable, Logger, BadRequestException, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { UserEntity } from '../users/user.entity';
import { CommunicationDispatchService } from '../communications/communication-dispatch.service';
import { CommunicationEventType, ChannelType } from '@crm/shared';

const RESET_TTL = 3600; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly supabaseAdmin: SupabaseClient | null;
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly config: ConfigService,
    @Optional()
    private readonly dispatchService: CommunicationDispatchService,
  ) {
    const supabaseUrl = this.config.get<string>('supabase.url') ?? '';
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

    if (supabaseUrl && serviceRoleKey) {
      this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } else {
      this.supabaseAdmin = null;
      this.logger.warn('SUPABASE_SERVICE_ROLE_KEY not set — reset password will not work');
    }

    this.frontendUrl = this.config.get<string>('FRONTEND_URL') ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !user.auth_user_id) {
      // Don't reveal whether the email exists
      return;
    }

    const token = randomUUID();
    const payload = JSON.stringify({
      user_id: user.id,
      auth_user_id: user.auth_user_id,
      email: user.email,
    });

    await this.redis.setex(`pwd-reset:${token}`, RESET_TTL, payload);

    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

    if (this.dispatchService) {
      void this.dispatchService.dispatch({
        organizationId: user.organization_id,
        eventType: CommunicationEventType.PASSWORD_RESET,
        channelType: ChannelType.EMAIL,
        recipient: user.email,
        variables: {
          user_name: user.full_name,
          reset_link: resetLink,
        },
      }).catch((err) => {
        this.logger.warn(`Failed to dispatch password reset email: ${err.message}`);
      });
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const raw = await this.redis.get(`pwd-reset:${token}`);
    if (!raw) {
      throw new BadRequestException('Invalid or expired token');
    }

    const { auth_user_id } = JSON.parse(raw) as { user_id: string; auth_user_id: string; email: string };

    if (!this.supabaseAdmin) {
      throw new BadRequestException('Password reset is not configured');
    }

    const { error } = await this.supabaseAdmin.auth.admin.updateUserById(auth_user_id, {
      password: newPassword,
    });

    if (error) {
      this.logger.error(`Supabase admin updateUser failed: ${error.message}`);
      throw new BadRequestException('Failed to update password');
    }

    await this.redis.del(`pwd-reset:${token}`);
  }
}
