import { Injectable, Optional } from '@nestjs/common';
import { ScheduledActionService } from '../../scheduled-action.service';
import { RealtimeBroadcastService } from '../../../../infrastructure/realtime/realtime-broadcast.service';
import { MailService } from '../../../../infrastructure/mail/mail.service';
import { renderTemplate } from '../../../../infrastructure/messaging/template';
import { renderEmail } from '../../../../infrastructure/messaging/email-layout';
import { ProsalesClientService } from '../../../ai-agents/prosales-client.service';
import { RunStoreService } from '../runtime/run-store.service';
import { ActionGuardService } from '../../core/action-guard.service';
import { durationMs } from '../time/automation-time';
import { DeliveryRunner } from './delivery-runner.service';
import { ChatSender } from './messaging.nodes';
import { StepError, type NodeContext, type NodeExecutor, type NodeOutcome } from './node-executor';

@Injectable()
export class NotifyTeamNode implements NodeExecutor<'notify_team'> {
  readonly type = 'notify_team' as const;

  constructor(
    private readonly store: RunStoreService,
    private readonly delivery: DeliveryRunner,
    private readonly mail: MailService,
    @Optional() private readonly realtime?: RealtimeBroadcastService,
  ) {}

  async execute(ctx: NodeContext<'notify_team'>): Promise<NodeOutcome> {
    const cfg = ctx.node.config;
    const title = renderTemplate(cfg.title, ctx.vars).trim();
    const description = cfg.description ? renderTemplate(cfg.description, ctx.vars).trim() : '';
    const output: Record<string, unknown> = { in_app: false };

    if (cfg.in_app) {
      // One in-app alert per step, even if the step is retried.
      const claim = await this.store.claimDelivery(ctx.run.organization_id, ctx.step.id, 'in_app', 'in_app');
      if (claim) {
        await this.realtime?.notifyOrg(ctx.run.organization_id, {
          type: 'system',
          title,
          description: description || undefined,
          href: ctx.run.conversation_id
            ? `/inbox?conversationId=${ctx.run.conversation_id}`
            : ctx.run.contact_id
              ? `/inbox?lead=${ctx.run.contact_id}`
              : undefined,
          contactId: ctx.run.contact_id ?? undefined,
          conversationId: ctx.run.conversation_id ?? undefined,
        });
        await this.store.settleDelivery(claim, 'sent');
      }
      output.in_app = true;
    }

    const emailTo = cfg.email_to;
    if (emailTo && (emailTo.roles?.length || emailTo.user_ids?.length)) {
      const emailed = await this.delivery.deliver(ctx, {
        recipients: { mode: 'team', team: emailTo },
        channel: 'email',
        send: async (recipient, vars) => {
          if (recipient.kind !== 'user' || !recipient.user.email) return { status: 'skipped', reason: 'No email', channel: 'email' };
          const email = renderEmail(
            {
              subject: title,
              heading: '{{organization.name}}',
              paragraphs: [description || title],
              footer: '{{organization.name}}',
            },
            { ...vars, user_name: recipient.user.full_name ?? '' },
          );
          await this.mail.send({ to: recipient.user.email, ...email });
          return { status: 'sent', channel: 'email' };
        },
      });
      if (emailed.kind !== 'next') return emailed;
      return { kind: 'next', output: { ...output, ...emailed.output } };
    }
    return { kind: 'next', output };
  }
}

@Injectable()
export class CreateTaskNode implements NodeExecutor<'create_task'> {
  readonly type = 'create_task' as const;

  constructor(
    private readonly store: RunStoreService,
    private readonly tasks: ScheduledActionService,
  ) {}

  async execute(ctx: NodeContext<'create_task'>): Promise<NodeOutcome> {
    const cfg = ctx.node.config;
    if (!ctx.run.contact_id) return { kind: 'fail', error: 'A task needs a contact', retryable: false };

    // A retry must not create a second task: reuse the one this step created.
    let taskId = ctx.previousOutput.task_id as string | undefined;
    if (!taskId) {
      const claim = await this.store.claimDelivery(ctx.run.organization_id, ctx.step.id, 'task', 'task');
      if (!claim) {
        // An earlier attempt got this far: find the task it created.
        const existing = await this.tasks.findByRunStep(ctx.run.organization_id, ctx.run.id, ctx.node.key);
        if (!existing) return { kind: 'fail', error: 'The task of this step could not be found', retryable: false };
        taskId = existing.id;
        return cfg.wait_until_done ? { kind: 'wait_for_task', taskId, output: { task_id: taskId } } : { kind: 'next', output: { task_id: taskId } };
      }
      const task = await this.tasks.create(
        ctx.run.organization_id,
        {
          contact_id: ctx.run.contact_id,
          conversation_id: ctx.run.conversation_id,
          action: 'create_task',
          executor: 'user',
          title: renderTemplate(cfg.title, ctx.vars).trim().slice(0, 500),
          description: cfg.description ? renderTemplate(cfg.description, ctx.vars) : null,
          due_at: new Date(ctx.now.getTime() + durationMs(cfg.due_in)),
          source: 'automation',
          run_id: ctx.run.id,
          node_key: ctx.node.key,
          metadata: { automation_id: ctx.run.automation_id, automation_run_id: ctx.run.id },
        },
        { origin: 'automation' },
      );
      await this.store.settleDelivery(claim, 'sent', { reference_id: task.id });
      taskId = task.id;
    }

    if (cfg.wait_until_done) return { kind: 'wait_for_task', taskId, output: { task_id: taskId } };
    return { kind: 'next', output: { task_id: taskId } };
  }
}

@Injectable()
export class CallNode implements NodeExecutor<'call'> {
  readonly type = 'call' as const;

  constructor(
    private readonly store: RunStoreService,
    private readonly guard: ActionGuardService,
    private readonly prosales: ProsalesClientService,
    private readonly chat: ChatSender,
  ) {}

  async execute(ctx: NodeContext<'call'>): Promise<NodeOutcome> {
    const contact = ctx.data.contact;
    if (!contact) return { kind: 'fail', error: 'A call needs a contact', retryable: false };
    const blocked = await this.guard.blockReason(ctx.run.organization_id, 'voice_minutes');
    if (blocked) return { kind: 'fail', error: blocked, retryable: false };

    const claim = await this.store.claimDelivery(ctx.run.organization_id, ctx.step.id, `contact:${contact.id}`, 'voice');
    if (!claim) return { kind: 'next', output: { already_done: true } };

    let reason: string;
    if (contact.phone) {
      try {
        await this.prosales.startOutboundCall(ctx.run.organization_id, contact.phone);
        await this.store.settleDelivery(claim, 'sent', { channel: 'voice' });
        return { kind: 'next', output: { called: contact.phone } };
      } catch (err) {
        reason = `The call could not start: ${(err as Error).message}`;
      }
    } else {
      reason = 'The contact has no phone number';
    }

    // Don't lose the touch: send the fallback message when one is set.
    const fallback = ctx.node.config.fallback_text ? renderTemplate(ctx.node.config.fallback_text, ctx.vars).trim() : '';
    if (fallback) {
      try {
        const sent = await this.chat.send(ctx, contact, fallback, ctx.vars, 'auto');
        await this.store.settleDelivery(claim, 'sent', { channel: sent.channel ?? 'chat', error: reason });
        return { kind: 'next', output: { called: false, fallback_channel: sent.channel, reason } };
      } catch (err) {
        reason = `${reason}; the fallback message failed: ${(err as Error).message}`;
      }
    }
    await this.store.settleDelivery(claim, 'failed', { error: reason });
    throw new StepError(reason, false);
  }
}
