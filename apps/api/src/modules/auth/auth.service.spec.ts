/// <reference types="jest" />
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserEntity } from '../users/user.entity';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { SUPABASE_ADMIN_CLIENT } from '../../infrastructure/supabase/supabase-admin.constants';
import { MailService } from '../../infrastructure/mail/mail.service';

describe('AuthService', () => {
  let redis: { setex: jest.Mock; get: jest.Mock; del: jest.Mock; set: jest.Mock };
  let configValues: Record<string, string>;
  let userRepo: { findOne: jest.Mock };
  let admin: { updateUserById: jest.Mock };
  let mail: { send: jest.Mock };

  async function build(supabaseConfigured = true) {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
        { provide: SUPABASE_ADMIN_CLIENT, useValue: supabaseConfigured ? { auth: { admin } } : null },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    return module.get(AuthService);
  }

  beforeEach(() => {
    redis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };
    configValues = {};
    userRepo = { findOne: jest.fn() };
    admin = { updateUserById: jest.fn().mockResolvedValue({ data: {}, error: null }) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
  });

  describe('forgotPassword', () => {
    it('stores a one-hour reset token for users linked to Supabase', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', organization_id: 'o1' });
      await (await build()).forgotPassword('a@b.co');
      expect(redis.setex).toHaveBeenCalledWith(expect.stringMatching(/^pwd-reset:[0-9a-f-]{36}$/), 3600, expect.any(String));
      expect(JSON.parse(redis.setex.mock.calls[0][2])).toEqual({ user_id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co' });
    });

    it('emails the reset link (English) with the stored token', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', full_name: 'Ana <b>', organization_id: 'o1' });
      await (await build()).forgotPassword('a@b.co');
      const token = (redis.setex.mock.calls[0][0] as string).replace('pwd-reset:', '');
      expect(mail.send).toHaveBeenCalledTimes(1);
      const sent = mail.send.mock.calls[0][0] as { to: string; subject: string; html: string };
      expect(sent.to).toBe('a@b.co');
      expect(sent.subject).toBe('Reset your password');
      expect(sent.html).toContain('<html lang="en">');
      expect(sent.html).toContain(`href="http://localhost:3000/reset-password?token=${token}"`);
      expect(sent.html).toContain('Hi Ana &lt;b&gt;,');
      expect(sent.html).toContain('This link expires in 1 hour.');
    });

    it('links to the deployed web app (NEXT_PUBLIC_WEB_URL) when FRONTEND_URL is not set', async () => {
      configValues = { NEXT_PUBLIC_WEB_URL: 'https://app.example.com/' };
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', organization_id: 'o1' });
      await (await build()).forgotPassword('a@b.co');
      expect((mail.send.mock.calls[0][0] as { html: string }).html).toContain('href="https://app.example.com/reset-password?token=');
    });

    it('prefers FRONTEND_URL for the link', async () => {
      configValues = { FRONTEND_URL: 'https://crm.example.com', NEXT_PUBLIC_WEB_URL: 'https://other.example.com' };
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', organization_id: 'o1' });
      await (await build()).forgotPassword('a@b.co');
      expect((mail.send.mock.calls[0][0] as { html: string }).html).toContain('href="https://crm.example.com/reset-password?token=');
    });

    it('looks the user up case-insensitively, only linked and active accounts', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await (await build()).forgotPassword('  Ana@Acme.COM ');
      const where = userRepo.findOne.mock.calls[0][0].where;
      expect(where.email.getSql('email')).toBe('LOWER(email) = :email');
      expect(where.email.objectLiteralParameters).toEqual({ email: 'ana@acme.com' });
      expect(where.is_active).toBe(true);
      expect(where.auth_user_id).toBeDefined();
    });

    it('sends at most one email per account per minute', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', organization_id: 'o1' });
      redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
      const service = await build();
      await service.forgotPassword('a@b.co');
      await service.forgotPassword('a@b.co');
      expect(redis.set).toHaveBeenCalledWith('pwd-reset:cooldown:u1', '1', 'EX', 60, 'NX');
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(redis.setex).toHaveBeenCalledTimes(1);
    });

    it('does not fail the request when the email cannot be sent', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', organization_id: 'o1' });
      mail.send.mockRejectedValue(new Error('provider down'));
      await expect((await build()).forgotPassword('a@b.co')).resolves.toBeUndefined();
    });

    it('does nothing (and reveals nothing) for unknown emails', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect((await build()).forgotPassword('nobody@b.co')).resolves.toBeUndefined();
      expect(redis.setex).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const stored = JSON.stringify({ user_id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co' });

    it('updates the password through the injected Supabase admin client and burns the token', async () => {
      redis.get.mockResolvedValue(stored);
      await (await build()).resetPassword('tok', 'new-pass');
      expect(redis.get).toHaveBeenCalledWith('pwd-reset:tok');
      expect(admin.updateUserById).toHaveBeenCalledWith('auth-1', { password: 'new-pass' });
      expect(redis.del).toHaveBeenCalledWith('pwd-reset:tok');
    });

    it('rejects unknown or expired tokens', async () => {
      redis.get.mockResolvedValue(null);
      await expect((await build()).resetPassword('tok', 'x')).rejects.toThrow(new BadRequestException('Invalid or expired token'));
      expect(admin.updateUserById).not.toHaveBeenCalled();
    });

    it('keeps the token when Supabase rejects the update', async () => {
      redis.get.mockResolvedValue(stored);
      admin.updateUserById.mockResolvedValue({ data: null, error: { message: 'weak password' } });
      await expect((await build()).resetPassword('tok', 'x')).rejects.toThrow(new BadRequestException('Failed to update password'));
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('reports a clear error when Supabase admin is not configured', async () => {
      redis.get.mockResolvedValue(stored);
      await expect((await build(false)).resetPassword('tok', 'x')).rejects.toThrow(
        new BadRequestException('Password reset is not configured'),
      );
    });
  });
});
