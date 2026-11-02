import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { OrganizationsService } from '../organizations/organizations.service';
import { ChannelsService } from '../integrations/channels.service';
import { AgentTriggerService } from '../ai-automation/agent-trigger.service';
import { RABBITMQ_SERVICE, RABBITMQ_QUEUES } from '../../infrastructure/rabbitmq/rabbitmq.constants';

interface ProsalesCreds {
  base_url: string;
  api_key: string;
  agent_version_id: string;
}

/**
 * Thin proxy to ProSales' Management API — identity/personality/rules/
 * strategies/knowledge for this org's single agent (see CLAUDE.md context:
 * "1 agente por org, conocimiento global", decided 2026-09-27). Credentials
 * live in organizations.settings.prosales (base_url, api_key,
 * agent_version_id), set once via PATCH /organizations/me/prosales-integration.
 *
 * Never returns the raw api_key anywhere — callers only get whatever
 * ProSales' endpoints themselves return (identity/personality/etc payloads).
 */
@Injectable()
export class ProsalesClientService {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly agentTriggerService: AgentTriggerService,
    private readonly config: ConfigService,
    private readonly channels: ChannelsService,
    @Inject(RABBITMQ_SERVICE) private readonly rmq: ClientProxy,
  ) {}

  /**
   * One-click provisioning: creates the org+agent+strategy-catalog on
   * ProSales (POST /provisioning/bootstrap, protected by a server-side-only
   * secret — never sent to the frontend), stores the returned credentials
   * in this org's settings.prosales, and registers the message.received
   * automation-agent row pointing at ProSales' /crm/inbound (inactive by
   * default — switching it on is still the manual step, via
   * MessageRoutingSection).
   *
   * Idempotent: POST /provisioning/bootstrap reuses the org by slug, so
   * calling this again for an org that already has one just re-syncs the
   * stored credentials instead of creating a duplicate.
   */
  async provisionAgent(orgId: string, agentType?: string) {
    const org = await this.orgsService.findById(orgId);
    const name = org.name;
    const slug = org.slug;

    const baseUrl = this.config.get<string>('prosales.baseUrl');
    const provisioningSecret = this.config.get<string>('prosales.provisioningSecret');
    if (!baseUrl || !provisioningSecret) {
      throw new BadRequestException(
        'PROSALES_BASE_URL / PROSALES_PROVISIONING_SECRET not configured on this server',
      );
    }

    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/provisioning/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provisioningSecret}`,
      },
      body: JSON.stringify({ name, slug, ...(agentType ? { agent_type: agentType } : {}) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      throw new BadRequestException(
        `ProSales bootstrap failed (${resp.status}): ${await resp.text().catch(() => '')}`,
      );
    }
    const boot = (await resp.json()) as {
      agent_version_id: string;
      api_key: string | null;
    };

    // A reused org (already bootstrapped before) doesn't return a fresh
    // api_key — plaintext keys aren't recoverable once created. If we don't
    // already have one stored, the caller needs to regenerate it manually
    // via POST /provisioning/organizations/{org_id}/regenerate-key.
    const existing = await this.orgsService.getProsalesIntegration(orgId);
    const apiKey = boot.api_key ?? existing.api_key;
    if (!apiKey) {
      throw new BadRequestException(
        'ProSales org already existed with no stored API key — regenerate it manually and set it via PATCH /organizations/me/prosales-integration',
      );
    }

    await this.orgsService.updateProsalesIntegration(orgId, {
      base_url: baseUrl,
      api_key: apiKey,
      agent_version_id: boot.agent_version_id,
    });

    // Idempotent: update the existing "ProSales" row for this event instead
    // of inserting a duplicate on repeated clicks.
    const allAgents = await this.agentTriggerService.findAll(orgId);
    const existingRow = allAgents.find(
      (a) => a.name === 'ProSales' && a.trigger_event === 'message.received',
    );
    const inboundUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/crm/inbound`;
    if (existingRow) {
      await this.agentTriggerService.update(existingRow.id, orgId, {
        workflow_endpoint: inboundUrl,
        auth_header_value: apiKey,
      });
    } else {
      await this.agentTriggerService.create(orgId, {
        name: 'ProSales',
        trigger_event: 'message.received',
        workflow_endpoint: inboundUrl,
        auth_header_value: apiKey,
        is_active: false,
      });
    }

    return { agent_version_id: boot.agent_version_id };
  }

  private async creds(orgId: string): Promise<ProsalesCreds> {
    const integration = await this.orgsService.getProsalesIntegration(orgId);
    if (!integration.base_url || !integration.api_key || !integration.agent_version_id) {
      throw new BadRequestException(
        'ProSales integration not configured for this organization (base_url/api_key/agent_version_id)',
      );
    }
    return integration as ProsalesCreds;
  }

  private async request<T>(
    orgId: string,
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 15_000,
  ): Promise<T> {
    const { base_url, api_key } = await this.creds(orgId);
    const resp = await fetch(`${base_url.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api_key}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      throw new BadRequestException(
        `ProSales responded ${resp.status}: ${await resp.text().catch(() => '')}`,
      );
    }
    if (resp.status === 204) return undefined as T;
    return resp.json() as Promise<T>;
  }

  async getConfig(orgId: string) {
    const { agent_version_id } = await this.creds(orgId);
    const [identity, personality, rules, strategies, qualification, knowledge] = await Promise.all([
      this.request(orgId, 'GET', `/api/v1/management/versions/${agent_version_id}/identity`).catch(
        () => null,
      ),
      this.request(orgId, 'GET', `/api/v1/management/versions/${agent_version_id}/personality`).catch(
        () => null,
      ),
      this.request(orgId, 'GET', `/api/v1/management/versions/${agent_version_id}/rules`),
      this.request(orgId, 'GET', `/api/v1/management/versions/${agent_version_id}/strategies`),
      this.request(orgId, 'GET', `/api/v1/management/versions/${agent_version_id}/qualification`),
      this.request(orgId, 'GET', `/api/v1/management/knowledge`),
    ]);
    return { identity, personality, rules, strategies, qualification, knowledge };
  }

  updateQualification(orgId: string, payload: unknown) {
    return this.withVersion(orgId, (v) =>
      this.request(orgId, 'PUT', `/api/v1/management/versions/${v}/qualification`, payload),
    );
  }

  updateIdentity(orgId: string, payload: unknown) {
    return this.withVersion(orgId, (v) =>
      this.request(orgId, 'PUT', `/api/v1/management/versions/${v}/identity`, payload),
    );
  }

  updatePersonality(orgId: string, payload: unknown) {
    return this.withVersion(orgId, (v) =>
      this.request(orgId, 'PUT', `/api/v1/management/versions/${v}/personality`, payload),
    );
  }

  updateRules(orgId: string, payload: unknown) {
    return this.withVersion(orgId, (v) =>
      this.request(orgId, 'PUT', `/api/v1/management/versions/${v}/rules`, payload),
    );
  }

  updateStrategies(orgId: string, payload: unknown) {
    return this.withVersion(orgId, (v) =>
      this.request(orgId, 'PUT', `/api/v1/management/versions/${v}/strategies`, payload),
    );
  }

  /**
   * Generate the whole agent config (identity/personality/rules/strategies)
   * from a plain-language brief. ProSales runs an LLM extractor, persists the
   * result, and returns it so the UI can show a read-only summary. The per-
   * section update* methods remain available for fine edits afterwards.
   */
  configureFromBrief(orgId: string, brief: string) {
    return this.withVersion(orgId, (v) =>
      this.request(orgId, 'POST', `/api/v1/management/versions/${v}/from-brief`, { brief }),
    );
  }

  /**
   * Push a verified outcome (e.g. a completed payment) so ProSales re-scores
   * the conversation's moves with real ground truth instead of only the
   * Cognition-inferred outcome. Reaches the endpoint under /management with
   * the org's Bearer key (the internal-token episode endpoint is unreachable
   * with that credential). Callers treat failures as non-fatal.
   */
  reportOutcome(orgId: string, conversationId: string, outcome: string, notes?: string): Promise<unknown> {
    return this.request(
      orgId,
      'POST',
      `/api/v1/management/conversations/${conversationId}/outcome`,
      { outcome, outcome_notes: notes ?? '' },
    );
  }

  /**
   * Start an outbound Retell call through ProSales. The org's Retell
   * credentials live only here (on the voice channel) and are sent per-call;
   * ProSales uses them to place the call and never stores them.
   */
  async startOutboundCall(orgId: string, toNumber: string, fromNumber?: string): Promise<unknown> {
    const { agent_version_id } = await this.creds(orgId);
    const channel = await this.channels.findActiveByType(orgId, 'voice');
    const cfg = (channel?.config ?? {}) as Record<string, string>;
    const identifier = channel?.external_identifier ?? '';
    const agentId = cfg.outbound_agent_id
      || cfg.agent_id
      || (identifier.startsWith('agent_') ? identifier : '');
    if (!agentId) {
      throw new BadRequestException('Voice channel has no Retell outbound agent id');
    }
    const storedFrom = fromNumber || cfg.outbound_number || '';
    const caller = looksLikePhone(storedFrom) ? storedFrom : undefined;
    const apiKey = cfg.api_key || this.config.get<string>('RETELL_API_KEY') || '';
    const result = await this.request(orgId, 'POST', '/api/v1/management/outbound-calls', {
      agent_version_id,
      to_number: toNumber,
      ...(caller ? { from_number: caller } : {}),
      ...(apiKey ? { retell_api_key: apiKey } : {}),
      retell_agent_id: agentId,
    });
    // Let listeners know an outbound call was requested (before Retell answers).
    this.rmq.emit(RABBITMQ_QUEUES.CALL_OUTBOUND_REQUESTED, {
      organization_id: orgId,
      to_number: toNumber,
      retell_agent_id: agentId,
    });
    return result;
  }

  listKnowledge(orgId: string) {
    return this.request(orgId, 'GET', `/api/v1/management/knowledge`);
  }

  createKnowledge(orgId: string, payload: unknown) {
    // Indexing chunks and embeddings for a long markdown takes longer than
    // the 15s used for identity/rules calls. 3 minutes covers that work;
    // the text itself is not truncated.
    return this.request(orgId, 'POST', `/api/v1/management/knowledge`, payload, 180_000);
  }

  deleteKnowledge(orgId: string, docId: string) {
    return this.request(orgId, 'DELETE', `/api/v1/management/knowledge/${docId}`);
  }

  private async withVersion<T>(orgId: string, fn: (versionId: string) => Promise<T>): Promise<T> {
    const { agent_version_id } = await this.creds(orgId);
    return fn(agent_version_id);
  }
}

function looksLikePhone(value: string): boolean {
  if (!value || value.startsWith('agent_')) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8;
}
