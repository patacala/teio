import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { ApiKeyEntity } from './api-key.entity';

export interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  expires_at?: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly repo: Repository<ApiKeyEntity>,
  ) {}

  static generateKey(): { plaintext: string; prefix: string } {
    const random = crypto.randomBytes(24).toString('base64url');
    const plaintext = `crm_live_${random}`;
    const prefix = plaintext.substring(0, 12);
    return { plaintext, prefix };
  }

  async create(
    orgId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyEntity & { key: string }> {
    const { plaintext, prefix } = ApiKeysService.generateKey();
    const key_hash = await bcrypt.hash(plaintext, 10);

    const entity = this.repo.create({
      organization_id: orgId,
      created_by: userId,
      name: dto.name,
      key_hash,
      key_prefix: prefix,
      scopes: dto.scopes ?? [],
      expires_at: dto.expires_at,
    });

    await this.repo.save(entity);
    return { ...entity, key: plaintext };
  }

  async findByPrefix(prefix: string): Promise<ApiKeyEntity | null> {
    return this.repo.findOne({ where: { key_prefix: prefix } });
  }

  async findAllByOrg(organizationId: string): Promise<ApiKeyEntity[]> {
    return this.repo.find({
      where: { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async revoke(id: string, organizationId: string): Promise<void> {
    const key = await this.repo.findOne({ where: { id, organization_id: organizationId } });
    if (!key) throw new NotFoundException(`API key ${id} not found`);
    await this.repo.update(id, { is_active: false });
  }

  async recordLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { last_used_at: new Date() });
  }
}
