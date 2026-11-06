import { Injectable, NestMiddleware, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type Redis from 'ioredis';
import type { SupabaseJwtPayload } from '@crm/shared';
import { CommunicationEventType, ChannelType } from '@crm/shared';
import { UsersService } from '../../modules/users/users.service';
import { userAuthCacheKey } from '../../modules/users/users.constants';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { OrganizationsService } from '../../modules/organizations/organizations.service';
import { CommunicationDispatchService } from '../../modules/communications/communication-dispatch.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

// JWKS set is created once at module level (caches public keys)
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS(supabaseUrl: string) {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return _jwks;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly usersService: UsersService,
    private readonly apiKeysService: ApiKeysService,
    private readonly orgsService: OrganizationsService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly dispatchService: CommunicationDispatchService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'] as string | undefined;
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    try {
      if (authHeader?.startsWith('Bearer ')) {
        await this.handleJwt(req, authHeader.slice(7));
      } else if (apiKeyHeader) {
        await this.handleApiKey(req, apiKeyHeader);
      }
    } catch {
      // Never throw from middleware — guards will reject if req.user is absent
    }

    next();
  }

  private async handleJwt(req: Request, token: string): Promise<void> {
    const supabaseUrl = this.config.get<string>('supabase.url') ?? '';
    const legacySecret = this.config.get<string>('supabase.jwtSecret') ?? '';

    let payload: SupabaseJwtPayload | null = null;

    // 1. Try ES256/RS256 via JWKS (new Supabase JWT Signing Keys)
    if (supabaseUrl) {
      try {
        const { payload: p } = await jwtVerify(token, getJWKS(supabaseUrl), {
          audience: 'authenticated',
        });
        payload = p as unknown as SupabaseJwtPayload;
      } catch {
        // fall through to legacy HS256
      }
    }

    // 2. Fallback: legacy HS256 secret (for tokens signed before migration)
    if (!payload && legacySecret) {
      try {
        payload = jwt.verify(token, legacySecret, {
          audience: 'authenticated',
        }) as SupabaseJwtPayload;
      } catch {
        return; // invalid token — guard handles 401
      }
    }

    if (!payload) return;

    const sub = payload.sub as string;
    const cacheKey = userAuthCacheKey(sub);
    let user: Awaited<ReturnType<UsersService['findByAuthUserId']>>;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      user = JSON.parse(cached) as NonNullable<typeof user>;
    } else {
      user = await this.usersService.findByAuthUserId(sub);

      if (!user) {
        // Auto-provision: create org + user on first login
        const email = (payload.email as string | undefined) ?? `user-${sub.slice(0, 8)}@local`;
        user = await this.provision(sub, email);
      }

      if (user) await this.redis.setex(cacheKey, 300, JSON.stringify(user));
    }

    if (!user) return;

    req.user = {
      id: user.id,
      auth_user_id: sub,
      email: user.email,
      organization_id: user.organization_id,
      role: user.role,
      is_platform_admin: user.is_platform_admin ?? false,
    };
    req.tenant = {
      organization_id: user.organization_id,
      user_id: user.id,
      role: user.role,
    };

    // Platform admin impersonation: override tenant org via x-organization-id header
    const impersonateOrgId = req.headers['x-organization-id'] as string | undefined;
    if (req.user.is_platform_admin && impersonateOrgId && impersonateOrgId !== user.organization_id) {
      try {
        const targetOrg = await this.orgsService.findById(impersonateOrgId);
        if (targetOrg) {
          req.tenant = {
            organization_id: targetOrg.id,
            user_id: user.id,
            role: user.role,
          };
        }
      } catch {
        // Invalid org id — keep original tenant
      }
    }
  }

  private async provision(authUserId: string, email: string) {
    try {
      const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
      const slug = `${base}-${authUserId.slice(0, 6)}`;

      let org = await this.orgsService.findBySlug(slug).catch(() => null);
      if (!org) {
        org = await this.orgsService.create({ name: email.split('@')[0], slug });
      }

      const user = await this.usersService.findOrCreate(authUserId, email, org.id, 'admin');

      // Fire-and-forget welcome email
      if (user && this.dispatchService) {
        void this.dispatchService.dispatch({
          organizationId: user.organization_id,
          eventType: CommunicationEventType.WELCOME,
          channelType: ChannelType.EMAIL,
          recipient: user.email,
          variables: { user_name: user.full_name, organization_name: org.name },
        }).catch(() => { /* non-critical */ });
      }

      return user;
    } catch {
      return null;
    }
  }

  private async handleApiKey(req: Request, rawKey: string): Promise<void> {
    if (!rawKey.startsWith('crm_')) return;

    const prefix = rawKey.substring(0, 12);
    const cacheKey = `apikey:${prefix}`;

    let apiKeyRecord: Awaited<ReturnType<ApiKeysService['findByPrefix']>>;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      apiKeyRecord = JSON.parse(cached) as NonNullable<typeof apiKeyRecord>;
    } else {
      apiKeyRecord = await this.apiKeysService.findByPrefix(prefix);
      if (apiKeyRecord) await this.redis.setex(cacheKey, 60, JSON.stringify(apiKeyRecord));
    }

    if (!apiKeyRecord || !apiKeyRecord.is_active) return;
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) return;

    const valid = await bcrypt.compare(rawKey, apiKeyRecord.key_hash);
    if (!valid) return;

    void this.apiKeysService.recordLastUsed(apiKeyRecord.id);

    req.user = {
      id: 'api-key',
      auth_user_id: null,
      email: null,
      organization_id: apiKeyRecord.organization_id,
      role: 'api_key',
    };
    req.tenant = {
      organization_id: apiKeyRecord.organization_id,
      user_id: apiKeyRecord.created_by ?? null,
      role: 'api_key',
    };
  }
}
