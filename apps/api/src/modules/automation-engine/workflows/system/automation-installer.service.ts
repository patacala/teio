import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AutomationsService } from '../automations.service';
import { EnrollmentService, type BeforeEventHook } from '../triggers/enrollment.service';
import { systemTemplates, type AiSetup, type SystemSetup } from './system-templates';

/** Bump when system templates are added; organizations below it get the missing ones. */
export const INSTALLER_VERSION = 1;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

interface AgentRow {
  id: string;
  name: string;
  trigger_event: string;
  is_active: boolean;
  updated_at: Date;
}

/**
 * Installs each organization's system automations: AI routing per its AI
 * connections, booking messages, the no-response follow-up and the opt-out
 * keywords. Idempotent: safe on every event and on every instance.
 */
@Injectable()
export class AutomationInstallerService implements OnModuleInit, BeforeEventHook {
  private readonly logger = new Logger(AutomationInstallerService.name);
  private readonly installed = new Set<string>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly automations: AutomationsService,
    private readonly enrollment: EnrollmentService,
  ) {}

  onModuleInit(): void {
    this.enrollment.setBeforeEventHook(this);
  }

  beforeEvent(organizationId: string): Promise<void> {
    return this.ensureInstalled(organizationId);
  }

  /** Installs what is missing for the organization (cached once done). */
  async ensureInstalled(organizationId: string): Promise<void> {
    if (this.installed.has(organizationId)) return;
    const pending = this.inFlight.get(organizationId);
    if (pending) return pending;
    const work = (async () => {
      const [org] = rowsOf<{ version: number | null }>(
        await this.dataSource.query(`SELECT (settings->>'automations_installed')::int AS version FROM core.organizations WHERE id = $1`, [organizationId]),
      );
      if (!org) return;
      if ((org.version ?? 0) < INSTALLER_VERSION) await this.install(organizationId);
      this.installed.add(organizationId);
    })().finally(() => this.inFlight.delete(organizationId));
    this.inFlight.set(organizationId, work);
    return work;
  }

  /** Installs every organization (the post-deploy backfill). */
  async installAll(): Promise<{ organizations: number; failed: string[] }> {
    const orgs = rowsOf<{ id: string }>(await this.dataSource.query(`SELECT id FROM core.organizations ORDER BY created_at`));
    const failed: string[] = [];
    for (const { id } of orgs) {
      try {
        await this.install(id);
        this.installed.add(id);
      } catch (err) {
        failed.push(id);
        this.logger.error(`Installing automations for ${id} failed: ${(err as Error).message}`);
      }
    }
    return { organizations: orgs.length - failed.length, failed };
  }

  async install(organizationId: string): Promise<void> {
    const setup = await this.readSetup(organizationId);
    for (const template of systemTemplates(setup)) {
      await this.automations.install(organizationId, {
        template_key: template.template_key,
        name: template.name,
        description: template.description,
        category: template.category,
        is_system: true,
        draft: template.definition,
        active: template.active,
      });
    }
    // The AI connections in use are enabled: automations now decide what reaches them.
    const agentIds = [setup.ai.incomingAgentId, setup.ai.paymentAgentId, setup.ai.callAgentId].filter((id): id is string => !!id);
    if (agentIds.length) {
      await this.dataSource.query(`UPDATE ai_agents.agents SET is_active = true WHERE id = ANY($1::uuid[]) AND organization_id = $2`, [agentIds, organizationId]);
    }
    await this.dataSource.query(
      `UPDATE core.organizations
          SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{automations_installed}', to_jsonb($2::int))
        WHERE id = $1`,
      [organizationId, INSTALLER_VERSION],
    );
    this.logger.log(`Automations installed for organization ${organizationId}`);
  }

  // ── Reading the organization's current setup ────────────────────────────

  async readSetup(organizationId: string): Promise<SystemSetup> {
    const agents = rowsOf<AgentRow>(
      await this.dataSource.query(
        `SELECT id, name, trigger_event, is_active, updated_at FROM ai_agents.agents WHERE organization_id = $1 ORDER BY updated_at DESC`,
        [organizationId],
      ),
    );
    const active = (event: string) => agents.filter((a) => a.is_active && a.trigger_event === event);
    const incomingActive = active('message.received');
    const incoming =
      incomingActive.find((a) => a.name === 'ProSales') ??
      incomingActive[0] ??
      agents.find((a) => a.name === 'ProSales' && a.trigger_event === 'message.received') ??
      null;
    const dedicatedPayment = [...active('payment.received'), ...active('payment.expired')][0] ?? null;
    const dedicatedCall = active('call.completed')[0] ?? null;

    const ai: AiSetup = {
      incomingActive: incomingActive.length > 0,
      incomingAgentId: incoming?.id ?? null,
      // Payments went to a dedicated agent, else to the incoming-message agent.
      paymentActive: !!dedicatedPayment || incomingActive.length > 0,
      paymentAgentId: dedicatedPayment?.id ?? incoming?.id ?? null,
      // Calls only ever reached an agent registered for them.
      callActive: !!dedicatedCall,
      callAgentId: dedicatedCall?.id ?? incoming?.id ?? null,
    };

    return { ai };
  }
}
