import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { AutomationDefinition, ConditionGroup, RunStatus, TenantContext } from '@crm/shared';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator';
import { PlatformAdmin } from '../../../common/decorators/platform-admin.decorator';
import { AutomationsService } from './automations.service';
import { RunsService } from './runs.service';
import { EnrollmentService } from './triggers/enrollment.service';
import { RecipientsService } from './nodes/recipients.service';
import { AutomationInstallerService } from './system/automation-installer.service';
import { AudienceCompileError } from './conditions/audience-sql.compiler';
import { AutomationVersionEntity } from './entities/automation-version.entity';

const ID = new ParseUUIDPipe();
const RUN_STATUSES = ['waiting', 'running', 'completed', 'exited', 'failed', 'cancelled'] as const;
const CATEGORIES = ['ai', 'messaging', 'booking', 'follow_up', 'custom'] as const;

class DefinitionDto implements AutomationDefinition {
  @IsArray()
  @ArrayMaxSize(20)
  triggers: AutomationDefinition['triggers'];

  @IsObject()
  graph: AutomationDefinition['graph'];

  @IsObject()
  settings: AutomationDefinition['settings'];
}

class CreateAutomationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsObject()
  draft?: AutomationDefinition;
}

class RenameAutomationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

class PauseAutomationDto {
  /** Also stop the runs in progress (default: they finish). */
  @IsOptional()
  @IsBoolean()
  stop_runs?: boolean;
}

class EnrollDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  contact_ids: string[];
}

class AudiencePreviewDto {
  @IsObject()
  filter: ConditionGroup;
}

class ListRunsQueryDto {
  @IsOptional()
  @IsIn(RUN_STATUSES)
  status?: RunStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * Automations of the organization. Everyone can look; only owners and admins
 * change them (API keys included in "no": automations are configuration).
 */
@Controller('automations')
export class AutomationsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly automations: AutomationsService,
    private readonly runs: RunsService,
    private readonly enrollment: EnrollmentService,
    private readonly recipients: RecipientsService,
    private readonly installer: AutomationInstallerService,
  ) {}

  // ── Static routes first ───────────────────────────────────────────────

  @Get()
  async list(@CurrentTenant() tenant: TenantContext) {
    await this.installer.ensureInstalled(tenant.organization_id);
    return this.automations.list(tenant.organization_id);
  }

  /** Organization data the builder offers in its pickers. */
  @Get('catalog')
  async catalog(@CurrentTenant() tenant: TenantContext) {
    const org = tenant.organization_id;
    const q = <T>(sql: string) => this.dataSource.query(sql, [org]).then((r: unknown) => rowsOf<T>(r));
    const [channels, stages, tags, customFields, users, calendars, services, aiConnections] = await Promise.all([
      q<{ id: string; type: string; name: string | null }>(
        `SELECT id, type, COALESCE(config->>'name', type) AS name FROM integrations.channels WHERE organization_id = $1 AND is_active ORDER BY type`,
      ),
      q<{ id: string; name: string; stage_type: string; funnel_id: string | null; funnel_name: string | null }>(
        `SELECT s.id, s.name, s.stage_type, s.funnel_id, f.name AS funnel_name
           FROM clients.funnel_stages s LEFT JOIN clients.funnels f ON f.id = s.funnel_id
          WHERE s.organization_id = $1 ORDER BY f.created_at, s.position`,
      ),
      q<{ tag: string }>(
        `SELECT DISTINCT t.tag FROM clients.contacts c, unnest(COALESCE(c.tags, '{}'::text[])) AS t(tag)
          WHERE c.organization_id = $1 ORDER BY t.tag LIMIT 500`,
      ),
      q<{ key: string }>(
        `SELECT DISTINCT k.key FROM clients.contacts c, jsonb_object_keys(COALESCE(c.custom_fields, '{}'::jsonb)) AS k(key)
          WHERE c.organization_id = $1 ORDER BY k.key LIMIT 200`,
      ),
      q<{ id: string; full_name: string | null; email: string; role: string }>(
        `SELECT id, full_name, email, role FROM core.users WHERE organization_id = $1 AND is_active ORDER BY full_name`,
      ),
      q<{ id: string; name: string; type: string }>(
        `SELECT id, name, type FROM scheduling.work_schedules WHERE organization_id = $1 AND is_active ORDER BY name`,
      ),
      q<{ id: string; name: string }>(`SELECT id, name FROM payments.services WHERE organization_id = $1 AND is_active ORDER BY name`),
      q<{ id: string; name: string; is_active: boolean }>(`SELECT id, name, is_active FROM ai_agents.agents WHERE organization_id = $1 ORDER BY name`),
    ]);
    return {
      channels,
      stages,
      tags: [...new Set(['opt-out', 'follow-up', ...tags.map((t) => t.tag)])].sort(),
      custom_fields: customFields.map((f) => f.key),
      users,
      calendars,
      services,
      ai_connections: aiConnections,
    };
  }

  @Post('validate')
  validate(@CurrentTenant() tenant: TenantContext, @Body() body: DefinitionDto) {
    return this.automations.validate(tenant.organization_id, body);
  }

  /** How many contacts a recipient filter matches now. */
  @Post('audience/preview')
  async audiencePreview(@CurrentTenant() tenant: TenantContext, @Body() body: AudiencePreviewDto) {
    try {
      return { count: await this.recipients.countFilter(tenant.organization_id, body.filter) };
    } catch (err) {
      if (err instanceof AudienceCompileError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  @Get('contact/:contactId/runs')
  contactRuns(@CurrentTenant() tenant: TenantContext, @Param('contactId', ID) contactId: string) {
    return this.runs.listForContact(tenant.organization_id, contactId);
  }

  @Get('runs/:runId')
  run(@CurrentTenant() tenant: TenantContext, @Param('runId', ID) runId: string) {
    return this.runs.detail(tenant.organization_id, runId);
  }

  /** Operational, like starting/stopping a follow-up was before: every member may do it. */
  @Post('runs/:runId/cancel')
  async cancelRun(@CurrentTenant() tenant: TenantContext, @Param('runId', ID) runId: string) {
    return { cancelled: await this.runs.cancel(tenant.organization_id, runId) };
  }

  /** Post-deploy backfill: installs every organization's system automations. */
  @Post('install-all')
  @PlatformAdmin()
  installAll() {
    return this.installer.installAll();
  }

  @Post()
  @AdminOnly()
  async create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateAutomationDto) {
    const automation = await this.automations.create(tenant.organization_id, body, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, automation.id);
  }

  // ── One automation ────────────────────────────────────────────────────

  @Get(':id')
  detail(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    return this.automations.detail(tenant.organization_id, id);
  }

  @Patch(':id')
  @AdminOnly()
  async rename(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string, @Body() body: RenameAutomationDto) {
    await this.automations.rename(tenant.organization_id, id, body, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, id);
  }

  @Put(':id/draft')
  @AdminOnly()
  async saveDraft(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string, @Body() body: DefinitionDto) {
    await this.automations.saveDraft(tenant.organization_id, id, body, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, id);
  }

  @Post(':id/publish')
  @AdminOnly()
  async publish(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    await this.automations.publish(tenant.organization_id, id, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, id);
  }

  @Post(':id/pause')
  @AdminOnly()
  async pause(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string, @Body() body: PauseAutomationDto) {
    await this.automations.pause(tenant.organization_id, id, { stopRuns: body?.stop_runs }, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, id);
  }

  @Post(':id/resume')
  @AdminOnly()
  async resume(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    await this.automations.resume(tenant.organization_id, id, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, id);
  }

  @Post(':id/duplicate')
  @AdminOnly()
  async duplicate(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    const copy = await this.automations.duplicate(tenant.organization_id, id, tenant.user_id ?? null);
    return this.automations.detail(tenant.organization_id, copy.id);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    await this.automations.remove(tenant.organization_id, id);
  }

  @Get(':id/versions')
  async versions(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string) {
    await this.automations.find(tenant.organization_id, id);
    const rows = await this.dataSource.getRepository(AutomationVersionEntity).find({
      where: { automation_id: id, organization_id: tenant.organization_id },
      order: { version: 'DESC' },
      select: ['id', 'version', 'published_at', 'published_by'],
    });
    return rows;
  }

  @Get(':id/runs')
  async automationRuns(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string, @Query() query: ListRunsQueryDto) {
    await this.automations.find(tenant.organization_id, id);
    return this.runs.listForAutomation(tenant.organization_id, id, query);
  }

  /** Adds contacts to an automation that has the manual trigger (any member, like starting a sequence was). */
  @Post(':id/enroll')
  async enroll(@CurrentTenant() tenant: TenantContext, @Param('id', ID) id: string, @Body() body: EnrollDto) {
    const automation = await this.automations.find(tenant.organization_id, id);
    if (automation.status !== 'active' || !automation.published_version_id) {
      throw new BadRequestException('Publish and activate the automation before adding contacts');
    }
    const version = await this.dataSource.getRepository(AutomationVersionEntity).findOneOrFail({ where: { id: automation.published_version_id } });
    if (!version.triggers.some((t) => t.key === 'manual')) {
      throw new BadRequestException('This automation does not accept contacts added by hand (add the "Added manually" trigger)');
    }
    return this.enrollment.enrollManually(automation, version, body.contact_ids, tenant.user_id ?? null);
  }
}
