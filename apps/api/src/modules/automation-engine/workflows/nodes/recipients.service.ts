import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { RecipientConfig } from '@crm/shared';
import { ContactEntity } from '../../../client-management/contact.entity';
import { UserEntity } from '../../../users/user.entity';
import { compileAudience } from '../conditions/audience-sql.compiler';
import { renderTemplate } from '../../../../infrastructure/messaging/template';
import type { NodeContext } from './node-executor';

export type Recipient =
  | { kind: 'contact'; key: string; contact: ContactEntity }
  | { kind: 'user'; key: string; user: UserEntity }
  | { kind: 'address'; key: string; address: string };

export interface RecipientBatch {
  recipients: Recipient[];
  /** Where the next batch starts; null when this was the last one. */
  nextCursor: string | null;
}

/** One recipient per step (the run's contact, a typed address) vs many (filter, picked contacts, team). */
export function isSingleRecipient(cfg: RecipientConfig): boolean {
  return cfg.mode === 'run_contact' || cfg.mode === 'custom';
}

/**
 * Who a messaging step sends to, read in batches (contact filters can match
 * thousands). Always scoped to the run's organization.
 */
@Injectable()
export class RecipientsService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async batch(ctx: NodeContext, cfg: RecipientConfig, cursor: string | null, limit: number): Promise<RecipientBatch> {
    const org = ctx.run.organization_id;
    switch (cfg.mode) {
      case 'run_contact': {
        const contact = ctx.data.contact;
        return { recipients: cursor || !contact ? [] : [{ kind: 'contact', key: `contact:${contact.id}`, contact }], nextCursor: null };
      }
      case 'custom': {
        if (cursor) return { recipients: [], nextCursor: null };
        const address = renderTemplate(cfg.address ?? '', ctx.vars).trim();
        return { recipients: address ? [{ kind: 'address', key: `address:${address.toLowerCase()}`, address }] : [], nextCursor: null };
      }
      case 'team': {
        if (cursor) return { recipients: [], nextCursor: null };
        const roles = cfg.team?.roles ?? [];
        const ids = cfg.team?.user_ids ?? [];
        const where = [
          ...(roles.length ? [{ organization_id: org, is_active: true, role: In(roles) }] : []),
          ...(ids.length ? [{ organization_id: org, is_active: true, id: In(ids) }] : []),
        ];
        const users = where.length ? await this.users.find({ where, order: { id: 'ASC' } }) : [];
        return { recipients: users.map((user) => ({ kind: 'user' as const, key: `user:${user.id}`, user })), nextCursor: null };
      }
      case 'contacts': {
        const ids = [...new Set(cfg.contact_ids ?? [])].sort().filter((id) => !cursor || id > cursor).slice(0, limit);
        const found = ids.length ? await this.contacts.find({ where: { organization_id: org, id: In(ids) }, order: { id: 'ASC' } }) : [];
        return {
          recipients: found.map((contact) => ({ kind: 'contact' as const, key: `contact:${contact.id}`, contact })),
          nextCursor: ids.length === limit ? ids[ids.length - 1] : null,
        };
      }
      case 'filter': {
        const { sql, params } = compileAudience(cfg.filter, ctx.now);
        const qb = this.contacts
          .createQueryBuilder('c')
          .where('c.organization_id = :org', { org })
          .andWhere(sql, params)
          .orderBy('c.id', 'ASC')
          .take(limit);
        if (cursor) qb.andWhere('c.id > :cursor', { cursor });
        const found = await qb.getMany();
        return {
          recipients: found.map((contact) => ({ kind: 'contact' as const, key: `contact:${contact.id}`, contact })),
          nextCursor: found.length === limit ? found[found.length - 1].id : null,
        };
      }
      default:
        return { recipients: [], nextCursor: null };
    }
  }

  /** How many contacts a filter matches now (shown in the builder before publishing). */
  async countFilter(organizationId: string, filter: RecipientConfig['filter'], now = new Date()): Promise<number> {
    const { sql, params } = compileAudience(filter, now);
    return this.contacts.createQueryBuilder('c').where('c.organization_id = :org', { org: organizationId }).andWhere(sql, params).getCount();
  }
}
