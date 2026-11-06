/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '@crm/shared';
import { UsersService, DUPLICATE_MEMBER_MESSAGE, EXISTING_ACCOUNT_MESSAGE } from './users.service';
import { UserEntity } from './user.entity';
import { SUPABASE_ADMIN_CLIENT } from '../../infrastructure/supabase/supabase-admin.constants';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ADMIN_ID = 'admin-1';
const NEW_ROW_ID = 'user-new';
const AUTH_ID = 'auth-new';

function authError(status: number, code: string, message = code) {
  return { name: 'AuthApiError', status, code, message };
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
  };
  let qb: { where: jest.Mock; getMany: jest.Mock };
  let redis: { del: jest.Mock };
  let admin: { createUser: jest.Mock; inviteUserByEmail: jest.Mock; deleteUser: jest.Mock };
  let configValues: Record<string, string | undefined>;

  async function build(supabaseConfigured = true) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: repo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: SUPABASE_ADMIN_CLIENT, useValue: supabaseConfigured ? { auth: { admin } } : null },
        { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
      ],
    }).compile();
    service = module.get(UsersService);
  }

  beforeEach(async () => {
    qb = { where: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) };
    repo = {
      createQueryBuilder: jest.fn(() => qb),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve({ id: NEW_ROW_ID, ...entity })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
    };
    redis = { del: jest.fn().mockResolvedValue(1) };
    admin = {
      createUser: jest.fn().mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null }),
      inviteUserByEmail: jest.fn().mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null }),
      deleteUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
    };
    configValues = { FRONTEND_URL: 'https://crm.example.com/' };
    await build();
  });

  describe('invite', () => {
    const invite = (email = 'New.Agent@Example.com', role = UserRole.AGENT) =>
      service.invite(ORG_A, ADMIN_ID, { email, role });

    it('links the Supabase account to the member row before the invite email is sent', async () => {
      const user = await invite();

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: ORG_A,
          email: 'new.agent@example.com',
          role: UserRole.AGENT,
          metadata: { invitation: expect.objectContaining({ status: 'pending', invited_by: ADMIN_ID }) },
        }),
      );
      expect(admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new.agent@example.com', email_confirm: false }),
      );
      expect(repo.update).toHaveBeenCalledWith(
        { id: NEW_ROW_ID, organization_id: ORG_A },
        { auth_user_id: AUTH_ID },
      );
      expect(admin.inviteUserByEmail).toHaveBeenCalledWith('new.agent@example.com', {
        redirectTo: 'https://crm.example.com/accept-invite',
      });

      const order = [
        repo.save.mock.invocationCallOrder[0],
        admin.createUser.mock.invocationCallOrder[0],
        repo.update.mock.invocationCallOrder[0],
        admin.inviteUserByEmail.mock.invocationCallOrder[0],
      ];
      expect([...order].sort((a, b) => a - b)).toEqual(order);

      expect(user).toMatchObject({ id: NEW_ROW_ID, organization_id: ORG_A, auth_user_id: AUTH_ID });
      expect(repo.delete).not.toHaveBeenCalled();
      expect(admin.deleteUser).not.toHaveBeenCalled();
    });

    it('falls back to NEXT_PUBLIC_WEB_URL for the redirect', async () => {
      configValues = { NEXT_PUBLIC_WEB_URL: 'http://localhost:4000' };
      await build();
      await invite();
      expect(admin.inviteUserByEmail).toHaveBeenCalledWith(expect.any(String), {
        redirectTo: 'http://localhost:4000/accept-invite',
      });
    });

    it('returns 503 and writes nothing when Supabase admin is not configured', async () => {
      await build(false);
      await expect(invite()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects an email that is already a member of the same org', async () => {
      qb.getMany.mockResolvedValue([{ id: 'x', organization_id: ORG_A }]);
      await expect(invite()).rejects.toThrow(new ConflictException(DUPLICATE_MEMBER_MESSAGE));
      expect(qb.where).toHaveBeenCalledWith('LOWER(u.email) = :email', { email: 'new.agent@example.com' });
      expect(repo.save).not.toHaveBeenCalled();
      expect(admin.createUser).not.toHaveBeenCalled();
    });

    it('rejects an email that already belongs to another org', async () => {
      qb.getMany.mockResolvedValue([{ id: 'x', organization_id: ORG_B }]);
      await expect(invite()).rejects.toThrow(new ConflictException(EXISTING_ACCOUNT_MESSAGE));
      expect(repo.save).not.toHaveBeenCalled();
      expect(admin.createUser).not.toHaveBeenCalled();
    });

    it('rejects an email that already has a Supabase account and removes the pending row', async () => {
      admin.createUser.mockResolvedValue({
        data: { user: null },
        error: authError(422, 'email_exists', 'A user with this email address has already been registered'),
      });

      await expect(invite()).rejects.toThrow(new ConflictException(EXISTING_ACCOUNT_MESSAGE));
      expect(repo.delete).toHaveBeenCalledWith({ id: NEW_ROW_ID, organization_id: ORG_A });
      expect(admin.deleteUser).not.toHaveBeenCalled();
      expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint race (23505) to 409 without touching Supabase', async () => {
      repo.save.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
      await expect(invite()).rejects.toThrow(new ConflictException(DUPLICATE_MEMBER_MESSAGE));
      expect(admin.createUser).not.toHaveBeenCalled();
    });

    it('deletes the Supabase user and the row when the email cannot be sent', async () => {
      admin.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: authError(500, 'unexpected_failure') });

      await expect(invite()).rejects.toBeInstanceOf(BadGatewayException);
      expect(admin.deleteUser).toHaveBeenCalledWith(AUTH_ID);
      expect(repo.delete).toHaveBeenCalledWith({ id: NEW_ROW_ID, organization_id: ORG_A });
    });

    it('surfaces the email rate limit as 429 and rolls back', async () => {
      admin.inviteUserByEmail.mockResolvedValue({
        data: { user: null },
        error: authError(429, 'over_email_send_rate_limit'),
      });

      await expect(invite()).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(admin.deleteUser).toHaveBeenCalledWith(AUTH_ID);
      expect(repo.delete).toHaveBeenCalled();
    });

    it('deletes the Supabase user when linking it to the row fails', async () => {
      repo.update.mockRejectedValue(new Error('db down'));
      await expect(invite()).rejects.toThrow('db down');
      expect(admin.deleteUser).toHaveBeenCalledWith(AUTH_ID);
      expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    const pending = () => ({
      id: 'u1',
      organization_id: ORG_A,
      full_name: 'new.agent',
      metadata: { invitation: { status: 'pending', invited_by: ADMIN_ID, invited_at: '2026-01-01T00:00:00.000Z' } },
    });

    it('marks a pending invitation accepted and stores the chosen name', async () => {
      repo.findOne.mockResolvedValue(pending());
      await service.acceptInvite('u1', ORG_A, { full_name: 'Jane Doe' });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'u1', organization_id: ORG_A } });
      const saved = repo.save.mock.calls[0][0];
      expect(saved.full_name).toBe('Jane Doe');
      expect(saved.metadata.invitation).toMatchObject({ status: 'accepted', invited_by: ADMIN_ID });
      expect(typeof saved.metadata.invitation.accepted_at).toBe('string');
    });

    it('is idempotent for an already accepted invitation', async () => {
      const user = pending();
      user.metadata.invitation.status = 'accepted';
      repo.findOne.mockResolvedValue(user);
      await expect(service.acceptInvite('u1', ORG_A, {})).resolves.toBe(user);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects users that were never invited', async () => {
      repo.findOne.mockResolvedValue({ id: 'u1', organization_id: ORG_A, metadata: {} });
      await expect(service.acceptInvite('u1', ORG_A, {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    const member = () => ({ id: 'u1', organization_id: ORG_A, auth_user_id: 'auth-u1', role: 'agent', is_active: true });

    it('drops the cached auth context when the role changes so it applies immediately', async () => {
      repo.findOne.mockResolvedValue(member());
      await service.update('u1', ORG_A, { role: UserRole.ADMIN });
      expect(redis.del).toHaveBeenCalledWith('user:auth:auth-u1');
    });

    it('drops the cached auth context when a member is deactivated', async () => {
      repo.findOne.mockResolvedValue(member());
      await service.update('u1', ORG_A, { is_active: false });
      expect(redis.del).toHaveBeenCalledWith('user:auth:auth-u1');
    });

    it('keeps the cache for changes that do not affect access', async () => {
      repo.findOne.mockResolvedValue(member());
      await service.update('u1', ORG_A, { full_name: 'New name', role: UserRole.AGENT });
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
