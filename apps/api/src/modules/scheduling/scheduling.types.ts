import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { UserRole } from '@crm/shared';
import type { TenantContext } from '@crm/shared';
import type { BookingViolation } from './domain/availability';

/** Who is changing a booking. Decides origin, overrides, payment rules and audit fields. */
export interface SchedulingActor {
  kind: 'user' | 'api_key' | 'ai' | 'payment' | 'contact' | 'system';
  userId?: string | null;
  role?: string | null;
}

export const SYSTEM_ACTOR: SchedulingActor = { kind: 'system' };
export const AI_ACTOR: SchedulingActor = { kind: 'ai' };

export function actorFromTenant(tenant: TenantContext): SchedulingActor {
  if (tenant.role === 'api_key') return { kind: 'api_key', userId: tenant.user_id ?? null, role: tenant.role };
  return { kind: 'user', userId: tenant.user_id ?? null, role: tenant.role };
}

export function isAdminActor(actor: SchedulingActor): boolean {
  return actor.kind === 'user' && (actor.role === UserRole.OWNER || actor.role === UserRole.ADMIN);
}

/** Stored appointments.origin. */
export function originForActor(actor: SchedulingActor): 'human' | 'webhook' | 'ai' {
  if (actor.kind === 'user') return 'human';
  if (actor.kind === 'api_key') return 'webhook';
  return 'ai';
}

export function userIdOf(actor: SchedulingActor): string | null {
  return actor.kind === 'user' ? actor.userId ?? null : null;
}

export class SlotUnavailableException extends ConflictException {
  constructor(violations: BookingViolation[]) {
    super({
      message: violations.includes('conflict')
        ? 'That time overlaps another booking on this calendar'
        : `That time is not bookable on this calendar (${violations.join(', ')})`,
      errors: { code: 'SLOT_NOT_AVAILABLE', violations },
    });
  }
}

/** A transaction whose side effects (events, emails) run only after it commits. */
export interface BookingTx {
  manager: EntityManager;
  afterCommit(effect: () => void): void;
}
