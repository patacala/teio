import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ChannelStrategyKey } from '@crm/shared';
import { ConversationManagementService } from '../../../conversation-management/conversation-management.service';
import { ChannelStrategyResolverService } from '../../channel-strategy-resolver.service';
import { MailService, type MailAttachment } from '../../../../infrastructure/mail/mail.service';
import { SmsService } from '../../../../infrastructure/sms/sms.service';
import { renderTemplate } from '../../../../infrastructure/messaging/template';
import { renderEmail, type EmailTemplate } from '../../../../infrastructure/messaging/email-layout';
import { buildIcs } from '../../../notifications/ics';
import { UserEntity } from '../../../users/user.entity';
import type { RunVars } from '../variables/run-vars';
import { DeliveryRunner, type SendResult } from './delivery-runner.service';
import type { Recipient } from './recipients.service';
import { StepError, type NodeContext, type NodeExecutor, type NodeOutcome } from './node-executor';

/** Who sends invites when the booking has no creator (kept from the platform booking emails). */
const INVITE_FALLBACK_ORGANIZER_EMAIL = 'noreply@prosalesia.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function runMetadata(ctx: NodeContext): Record<string, unknown> {
  return { automation_id: ctx.run.automation_id, automation_run_id: ctx.run.id, automation_step_id: ctx.step.id };
}

/** A chat message written in the builder, sent as an email when email is the channel picked. */
function chatAsEmail(text: string): EmailTemplate {
  return {
    subject: '{{organization.name}}',
    heading: '{{organization.name}}',
    greeting: null,
    paragraphs: [text],
    footer: '{{organization.name}}',
  };
}

/**
 * Sends a chat message to a contact on the channel the strategy picks
 * (WhatsApp, Instagram, Messenger, SMS… or email). Shared by "Send message"
 * and the fallback of "Call contact".
 */
@Injectable()
export class ChatSender {
  constructor(
    private readonly channels: ChannelStrategyResolverService,
    private readonly conversations: ConversationManagementService,
    private readonly mail: MailService,
  ) {}

  async send(ctx: NodeContext, contact: Extract<Recipient, { kind: 'contact' }>['contact'], text: string, vars: RunVars, strategy: ChannelStrategyKey): Promise<SendResult> {
    const originalChannel = contact.id === ctx.run.contact_id ? ctx.data.conversation?.channel : undefined;
    const resolved = await this.channels.resolve(contact, ctx.run.organization_id, strategy, { original_channel: originalChannel });
    if (!resolved) throw new StepError('The contact has no channel we can message', false);

    if (resolved.channel === 'email') {
      await this.mail.send({ to: resolved.recipientId, ...renderEmail(chatAsEmail(text), vars) });
      return { status: 'sent', channel: 'email' };
    }
    if (resolved.channel === 'voice') throw new StepError('A chat message cannot be sent by phone call', false);

    const { conversation } = await this.conversations.findOrCreateActiveConversation(
      ctx.run.organization_id,
      contact.id,
      '',
      resolved.channel,
      'business',
    );
    const message = await this.conversations.sendMessage(conversation.id, ctx.run.organization_id, {
      content: text,
      direction: 'outbound',
      sender_type: 'automation',
      metadata: runMetadata(ctx),
    });
    return { status: 'sent', channel: resolved.channel, reference: message.id };
  }
}

@Injectable()
export class SendMessageNode implements NodeExecutor<'send_message'> {
  readonly type = 'send_message' as const;

  constructor(
    private readonly delivery: DeliveryRunner,
    private readonly chat: ChatSender,
  ) {}

  execute(ctx: NodeContext<'send_message'>): Promise<NodeOutcome> {
    const cfg = ctx.node.config;
    return this.delivery.deliver(ctx, {
      recipients: cfg.recipients,
      channel: 'chat',
      metric: 'messages',
      send: async (recipient, vars) => {
        if (recipient.kind !== 'contact') return { status: 'skipped', reason: 'Chat messages go to contacts only' };
        const text = renderTemplate(cfg.text, vars).trim();
        if (!text) return { status: 'skipped', reason: 'The message is empty for this contact' };
        return this.chat.send(ctx, recipient.contact, text, vars, cfg.channel_strategy);
      },
    });
  }
}

@Injectable()
export class SendEmailNode implements NodeExecutor<'send_email'> {
  readonly type = 'send_email' as const;

  constructor(
    private readonly delivery: DeliveryRunner,
    private readonly mail: MailService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  execute(ctx: NodeContext<'send_email'>): Promise<NodeOutcome> {
    return this.delivery.deliver(ctx, {
      recipients: ctx.node.config.recipients,
      channel: 'email',
      metric: 'messages',
      send: (recipient, vars) => this.sendOne(ctx, recipient, vars),
    });
  }

  private async sendOne(ctx: NodeContext<'send_email'>, recipient: Recipient, vars: RunVars): Promise<SendResult> {
    let to: string;
    let recipientVars = vars;
    if (recipient.kind === 'contact') to = recipient.contact.email ?? '';
    else if (recipient.kind === 'user') {
      to = recipient.user.email;
      // {{user_name}} is whoever receives the email (here a team member).
      recipientVars = { ...vars, user_name: recipient.user.full_name ?? '' };
    } else to = recipient.address;
    if (!to || !EMAIL_RE.test(to)) return { status: 'skipped', reason: 'No valid email address', channel: 'email' };

    const rendered = renderEmail(ctx.node.config.email as EmailTemplate, recipientVars);
    const invite = ctx.node.config.calendar_invite;
    const attachments: MailAttachment[] = [];
    if ((invite === 'request' || invite === 'cancel') && recipient.kind === 'contact') {
      attachments.push(await this.invite(ctx, recipient, to, invite === 'request' ? 'REQUEST' : 'CANCEL'));
    }
    await this.mail.send({ to, ...rendered, ...(attachments.length ? { attachments } : {}) });
    return { status: 'sent', channel: 'email' };
  }

  /** Calendar invite for the appointment in the trigger (same invite the platform emails attached). */
  private async invite(ctx: NodeContext, recipient: Extract<Recipient, { kind: 'contact' }>, email: string, method: 'REQUEST' | 'CANCEL'): Promise<MailAttachment> {
    const t = (ctx.run.context.trigger?.data ?? {}) as Record<string, unknown>;
    const orgName = (ctx.vars.organization as { name: string }).name;
    let organizer = { name: orgName, email: INVITE_FALLBACK_ORGANIZER_EMAIL };
    if (typeof t.created_by === 'string' && t.created_by) {
      const creator = await this.users.findOne({ where: { id: t.created_by, organization_id: ctx.run.organization_id } });
      if (creator) organizer = { name: creator.full_name || orgName, email: creator.email };
    }
    const contactName = [recipient.contact.first_name, recipient.contact.last_name].filter(Boolean).join(' ');
    const ics = buildIcs({
      method,
      uid: `${String(t.appointment_id)}@crm`,
      sequence: Number(t.sequence ?? 1),
      start: new Date(String(t.starts_at)),
      end: new Date(String(t.ends_at)),
      title: String(t.title ?? ''),
      description: (t.description as string | null) ?? undefined,
      location: (t.location as string | null) ?? undefined,
      url: (t.meeting_url as string | null) ?? undefined,
      organizer,
      attendee: { name: contactName || email, email },
      productName: orgName,
    });
    return {
      filename: method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
      content: Buffer.from(ics).toString('base64'),
      contentType: `text/calendar; method=${method}`,
    };
  }
}

@Injectable()
export class SendSmsNode implements NodeExecutor<'send_sms'> {
  readonly type = 'send_sms' as const;

  constructor(
    private readonly delivery: DeliveryRunner,
    private readonly sms: SmsService,
  ) {}

  execute(ctx: NodeContext<'send_sms'>): Promise<NodeOutcome> {
    return this.delivery.deliver(ctx, {
      recipients: ctx.node.config.recipients,
      channel: 'sms',
      metric: 'messages',
      send: async (recipient, vars) => {
        const to = recipient.kind === 'contact' ? recipient.contact.phone ?? '' : recipient.kind === 'address' ? recipient.address : '';
        if (!to.trim()) return { status: 'skipped', reason: 'No phone number', channel: 'sms' };
        const text = renderTemplate(ctx.node.config.text, vars).trim();
        if (!text) return { status: 'skipped', reason: 'The message is empty for this contact', channel: 'sms' };
        const result = await this.sms.send({ to: to.trim(), text });
        return { status: 'sent', channel: 'sms', reference: result.providerId ?? null };
      },
    });
  }
}
