/// <reference types="jest" />
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserEntity } from '../users/user.entity';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { SUPABASE_ADMIN_CLIENT } from '../../infrastructure/supabase/supabase-admin.constants';

describe('AuthService', () => {
  let redis: { setex: jest.Mock; get: jest.Mock; del: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let admin: { updateUserById: jest.Mock };

  async function build(supabaseConfigured = true) {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SUPABASE_ADMIN_CLIENT, useValue: supabaseConfigured ? { auth: { admin } } : null },
      ],
    }).compile();
    return module.get(AuthService);
  }

  beforeEach(() => {
    redis = { setex: jest.fn().mockResolvedValue('OK'), get: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    userRepo = { findOne: jest.fn() };
    admin = { updateUserById: jest.fn().mockResolvedValue({ data: {}, error: null }) };
  });

  describe('forgotPassword', () => {
    it('stores a one-hour reset token for users linked to Supabase', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co', organization_id: 'o1' });
      await (await build()).forgotPassword('a@b.co');
      expect(redis.setex).toHaveBeenCalledWith(expect.stringMatching(/^pwd-reset:[0-9a-f-]{36}$/), 3600, expect.any(String));
      expect(JSON.parse(redis.setex.mock.calls[0][2])).toEqual({ user_id: 'u1', auth_user_id: 'auth-1', email: 'a@b.co' });
    });

    it('does nothing (and reveals nothing) for unknown emails', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect((await build()).forgotPassword('nobody@b.co')).resolves.toBeUndefined();
      expect(redis.setex).not.toHaveBeenCalled();
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
