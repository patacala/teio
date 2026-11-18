import { Injectable } from '@nestjs/common';
import { ClientManagementService } from '../../../client-management/client-management.service';
import { ConversationManagementService } from '../../../conversation-management/conversation-management.service';
import { renderTemplate } from '../../../../infrastructure/messaging/template';
import type { NodeContext, NodeExecutor, NodeOutcome } from './node-executor';

/** Contact steps act on the run's contact; tag/field changes report source 'automation'. */
function contactOf(ctx: NodeContext): string {
  if (!ctx.run.contact_id || !ctx.data.contact) throw new Error('This step needs a contact');
  return ctx.run.contact_id;
}

@Injectable()
export class AddTagNode implements NodeExecutor<'add_tag'> {
  readonly type = 'add_tag' as const;
  constructor(private readonly clients: ClientManagementService) {}

  async execute(ctx: NodeContext<'add_tag'>): Promise<NodeOutcome> {
    const tag = ctx.node.config.tag.trim();
    const had = (ctx.data.contact?.tags ?? []).includes(tag);
    await this.clients.addTag(contactOf(ctx), ctx.run.organization_id, tag, 'automation');
    return { kind: 'next', output: { tag, changed: !had } };
  }
}

@Injectable()
export class RemoveTagNode implements NodeExecutor<'remove_tag'> {
  readonly type = 'remove_tag' as const;
  constructor(private readonly clients: ClientManagementService) {}

  async execute(ctx: NodeContext<'remove_tag'>): Promise<NodeOutcome> {
    const tag = ctx.node.config.tag.trim();
    const had = (ctx.data.contact?.tags ?? []).includes(tag);
    if (had) await this.clients.removeTag(contactOf(ctx), ctx.run.organization_id, tag, 'automation');
    return { kind: 'next', output: { tag, changed: had } };
  }
}

const CORE_FIELDS = new Set(['first_name', 'last_name', 'email', 'phone']);

@Injectable()
export class UpdateContactNode implements NodeExecutor<'update_contact'> {
  readonly type = 'update_contact' as const;
  constructor(private readonly clients: ClientManagementService) {}

  async execute(ctx: NodeContext<'update_contact'>): Promise<NodeOutcome> {
    const dto: Record<string, unknown> = {};
    const custom: Record<string, unknown> = {};
    for (const { field, value } of ctx.node.config.fields) {
      const rendered = renderTemplate(value ?? '', ctx.vars);
      if (CORE_FIELDS.has(field)) dto[field] = rendered;
      else if (field.startsWith('custom.')) custom[field.slice('custom.'.length)] = rendered;
    }
    if (Object.keys(custom).length) dto.custom_fields = custom;
    await this.clients.update(contactOf(ctx), ctx.run.organization_id, dto as never, 'automation');
    return { kind: 'next', output: { updated: Object.keys({ ...dto, ...custom }).filter((k) => k !== 'custom_fields') } };
  }
}

@Injectable()
export class MoveStageNode implements NodeExecutor<'move_stage'> {
  readonly type = 'move_stage' as const;
  constructor(private readonly clients: ClientManagementService) {}

  async execute(ctx: NodeContext<'move_stage'>): Promise<NodeOutcome> {
    const contactId = contactOf(ctx);
    const target = ctx.node.config.stage_id;
    const current = ctx.data.contact?.lead_stage ?? null;
    if (current === target) return { kind: 'next', output: { stage_id: target, changed: false } };
    const reason = `Automation step "${ctx.node.label ?? 'Move funnel stage'}"`;
    // Compare-and-set on the stage we read, like the funnel rules; a contact
    // without a stage is placed with a plain update.
    const moved = current
      ? await this.clients.moveStageIfUnchanged(contactId, ctx.run.organization_id, current, target, reason)
      : !!(await this.clients.updateStage(contactId, ctx.run.organization_id, target));
    if (!moved) return { kind: 'fail', error: 'The contact changed stage at the same time; trying again', retryable: true };
    return { kind: 'next', output: { stage_id: target, from_stage_id: current, changed: true } };
  }
}

@Injectable()
export class SetAiNode implements NodeExecutor<'set_ai'> {
  readonly type = 'set_ai' as const;
  constructor(private readonly conversations: ConversationManagementService) {}

  async execute(ctx: NodeContext<'set_ai'>): Promise<NodeOutcome> {
    const conversationId = ctx.run.conversation_id;
    if (!conversationId) return { kind: 'fail', error: 'This run has no conversation', retryable: false };
    const changed = await this.conversations.setBotActive(conversationId, ctx.run.organization_id, ctx.node.config.active);
    return { kind: 'next', output: { ai_active: ctx.node.config.active, changed } };
  }
}
