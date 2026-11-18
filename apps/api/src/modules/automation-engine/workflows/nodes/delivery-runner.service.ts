import { Injectable, Logger } from '@nestjs/common';
import type { RecipientConfig } from '@crm/shared';
import { RunStoreService } from '../runtime/run-store.service';
import { OrgTimeService } from '../time/org-time.service';
import { nextBusinessTime } from '../time/automation-time';
import { ActionGuardService, type GuardedMetric } from '../../core/action-guard.service';
import { withContact, type RunVars } from '../variables/run-vars';
import { RecipientsService, isSingleRecipient, type Recipient } from './recipients.service';
import { StepError, type NodeContext, type NodeOutcome } from './node-executor';

export type SendResult =
  | { status: 'sent'; channel?: string; reference?: string | null }
  | { status: 'skipped'; reason: string; channel?: string };

export interface DeliveryOptions {
  recipients: RecipientConfig;
  /** Ledger channel before the real one is known (e.g. 'email'; chat picks it per contact). */
  channel: string;
  metric?: GuardedMetric;
  send(recipient: Recipient, vars: RunVars): Promise<SendResult>;
}

export const DELIVERY_BATCH = 200;
/** Most recipients one step may reach (a filter can match a whole database). */
export const MAX_RECIPIENTS_PER_STEP = Number(process.env.AUTOMATION_MAX_RECIPIENTS_PER_STEP ?? 5000);

interface Progress {
  cursor: string | null;
  sent: number;
  failed: number;
  skipped: number;
  reached: number;
  capped?: boolean;
  last_error?: string | null;
}

/**
 * Sends one step to its recipients: holds it outside business hours (when the
 * automation asks), checks billing, skips opted-out contacts, and records each
 * recipient before sending so a retry or a restart never sends twice. Large
 * audiences go out in batches, the step resuming where it stopped.
 */
@Injectable()
export class DeliveryRunner {
  private readonly logger = new Logger(DeliveryRunner.name);

  constructor(
    private readonly store: RunStoreService,
    private readonly recipientsService: RecipientsService,
    private readonly time: OrgTimeService,
    private readonly guard: ActionGuardService,
  ) {}

  async deliver(ctx: NodeContext, opts: DeliveryOptions): Promise<NodeOutcome> {
    const org = ctx.run.organization_id;
    const settings = ctx.version.settings;
    const prev = ctx.previousOutput as Partial<Progress>;
    const progress: Progress = {
      cursor: prev.cursor ?? null,
      sent: prev.sent ?? 0,
      failed: prev.failed ?? 0,
      skipped: prev.skipped ?? 0,
      reached: prev.reached ?? 0,
    };

    if (settings?.send_window === 'business_hours') {
      const open = nextBusinessTime(ctx.now, await this.time.businessHours(org));
      if (open.getTime() > ctx.now.getTime()) return { kind: 'defer', at: open, output: { ...progress, held_until: open.toISOString() } };
    }

    const blocked = await this.guard.blockReason(org, opts.metric);
    if (blocked) return { kind: 'fail', error: blocked, retryable: false, output: { ...progress } };

    const single = isSingleRecipient(opts.recipients);
    const room = MAX_RECIPIENTS_PER_STEP - progress.reached;
    const batch = await this.recipientsService.batch(ctx, opts.recipients, progress.cursor, Math.max(1, Math.min(DELIVERY_BATCH, room)));

    let singleFailure: StepError | null = null;
    for (const recipient of batch.recipients) {
      progress.reached += 1;
      const deliveryId = await this.store.claimDelivery(org, ctx.step.id, recipient.key, opts.channel);
      if (!deliveryId) continue; // handled by an earlier attempt of this step

      if (recipient.kind === 'contact' && settings?.respect_opt_out !== false && (recipient.contact.tags ?? []).includes('opt-out')) {
        await this.store.settleDelivery(deliveryId, 'skipped', { error: 'The contact opted out' });
        progress.skipped += 1;
        continue;
      }

      const vars = recipient.kind === 'contact' && recipient.contact.id !== ctx.data.contact?.id ? withContact(ctx.vars, recipient.contact) : ctx.vars;
      try {
        const result = await opts.send(recipient, vars);
        if (result.status === 'sent') {
          await this.store.settleDelivery(deliveryId, 'sent', { reference_id: result.reference ?? null, channel: result.channel ?? opts.channel });
          progress.sent += 1;
        } else {
          await this.store.settleDelivery(deliveryId, 'skipped', { error: result.reason, channel: result.channel ?? opts.channel });
          progress.skipped += 1;
          progress.last_error = result.reason;
        }
      } catch (err) {
        const error = err instanceof StepError ? err : new StepError((err as Error).message, true);
        progress.last_error = error.message;
        if (single && error.retryable) {
          // Nothing was sent: free the recipient so the retry can send it.
          await this.store.releaseDelivery(deliveryId);
          return { kind: 'fail', error: error.message, retryable: true, output: { ...progress } };
        }
        await this.store.settleDelivery(deliveryId, 'failed', { error: error.message });
        progress.failed += 1;
        if (single) singleFailure = error;
        else this.logger.warn(`Run ${ctx.run.id} step ${ctx.node.key}: ${recipient.key} failed: ${error.message}`);
      }
    }

    if (batch.nextCursor && progress.reached < MAX_RECIPIENTS_PER_STEP) {
      progress.cursor = batch.nextCursor;
      return { kind: 'defer', at: ctx.now, output: { ...progress } };
    }
    if (batch.nextCursor) progress.capped = true;
    progress.cursor = null;

    if (singleFailure) return { kind: 'fail', error: singleFailure.message, retryable: false, output: { ...progress } };
    return { kind: 'next', output: { ...progress } };
  }
}
