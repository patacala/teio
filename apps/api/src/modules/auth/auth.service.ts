import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Raw, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { SUPABASE_ADMIN_CLIENT } from '../../infrastructure/supabase/supabase-admin.constants';
import { MailService } from '../../infrastructure/mail/mail.service';
import { emailFromTemplate, webAppUrl } from '../../infrastructure/messaging';
import { UserEntity } from '../users/user.entity';

const RESET_TTL = 3600; // 1 hour
/** One reset email per account per minute (the endpoint is public and there is no global rate limit). */
const RESET_COOLDOWN_SECONDS = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly config: ConfigService,
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabaseAdmin: SupabaseClient | null,
    private readonly mailService: MailService,
  ) {
    this.frontendUrl = webAppUrl(this.config);
  }

  async forgotPassword(email: string): Promise<void> {
    // Emails are stored lowercase by the invite flow, but users type them however they like.
    const normalized = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: {
        email: Raw((column) => `LOWER(${column}) = :email`, { email: normalized }),
        auth_user_id: Not(IsNull()),
        is_active: true,
      },
      order: { created_at: 'ASC' },
    });
    // Unknown, unlinked or deactivated: do nothing, and don't reveal which.
    if (!user) return;

    const claimed = await this.redis.set(`pwd-reset:cooldown:${user.id}`, '1', 'EX', RESET_COOLDOWN_SECONDS, 'NX');
    if (!claimed) return;

    const token = randomUUID();
    const payload = JSON.stringify({
      user_id: user.id,
      auth_user_id: user.auth_user_id,
      email: user.email,
    });

    await this.redis.setex(`pwd-reset:${token}`, RESET_TTL, payload);

    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

    // Fire-and-forget: the response must not depend on (or reveal) delivery.
    void this.mailService
      .send({ to: user.email, ...emailFromTemplate('password_reset', { user_name: user.full_name, reset_url: resetLink }) })
      .catch((err: Error) => {
        this.logger.warn(`Failed to send password reset email: ${err.message}`);
      });
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
