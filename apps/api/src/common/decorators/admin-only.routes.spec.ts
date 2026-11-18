import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@crm/shared';
import { ROLES_KEY } from './roles.decorator';
import { ORG_ADMIN_ROLES } from './admin-only.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { AIAgentsController } from '../../modules/ai-agents/ai-agents.controller';
import {
  AutomationAgentsController,
  AutomationToolsController,
} from '../../modules/ai-automation/automation-agents.controller';
import { ChannelsController } from '../../modules/integrations/channels.controller';
import { WahaChannelController } from '../../modules/integrations/waha-channel.controller';
import { IntegrationsController } from '../../modules/integrations/integrations.controller';
import { PaymentServiceController } from '../../modules/payments/payment-service.controller';
import { PaymentsController } from '../../modules/payments/payments.controller';
import { AutomationsController } from '../../modules/automation-engine/workflows/automations.controller';

type Ctor = { prototype: any; name: string };

function rolesOf(controller: Ctor, method: string): UserRole[] | undefined {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') throw new Error(`${controller.name}.${method} does not exist`);
  return Reflect.getMetadata(ROLES_KEY, handler);
}

/**
 * The four configuration areas the product owner restricted to admins
 * (AI agent, channels, webhooks, service prices). Every write is owner/admin
 * only; reads stay open because agents need them (capture-field labels,
 * channel badges, the payment-link service picker).
 */
const ADMIN_ONLY: Array<[Ctor, string[]]> = [
  [AIAgentsController, [
    'provisionAgent', 'configureFromBrief', 'updateIdentity', 'updatePersonality', 'updateRules',
    'updateStrategies', 'updateQualification', 'create', 'update', 'activate', 'deactivate',
    'reorderCaptureFields', 'createCaptureField', 'updateCaptureField', 'deleteCaptureField',
  ]],
  [AutomationAgentsController, ['create', 'update', 'deactivate']],
  [AutomationToolsController, ['create']],
  [ChannelsController, ['create', 'testConnection', 'update', 'deactivate', 'remove']],
  [WahaChannelController, ['createSession', 'getQr', 'requestPairingCode', 'relink', 'unlink']],
  [IntegrationsController, ['create', 'testWebhook', 'update', 'delete']],
  [PaymentServiceController, ['create', 'update', 'remove']],
  [AutomationsController, ['create', 'rename', 'saveDraft', 'publish', 'pause', 'resume', 'duplicate', 'remove']],
];

const OPEN_READS: Array<[Ctor, string[]]> = [
  [AIAgentsController, ['getConfig', 'findAll', 'findOne', 'getCaptureFields']],
  [AutomationAgentsController, ['findAll']],
  [ChannelsController, ['findAll', 'findOne']],
  [PaymentServiceController, ['findAll']],
  [AutomationsController, ['list', 'catalog', 'detail', 'versions', 'automationRuns', 'contactRuns', 'run', 'validate', 'audiencePreview', 'enroll', 'cancelRun']],
];

describe('admin-only configuration routes', () => {
  it.each(ADMIN_ONLY.flatMap(([c, methods]) => methods.map((m) => [c.name, m, c] as const)))(
    '%s.%s is owner/admin only',
    (_name, method, controller) => {
      expect(rolesOf(controller, method)).toEqual(ORG_ADMIN_ROLES);
    },
  );

  it.each(OPEN_READS.flatMap(([c, methods]) => methods.map((m) => [c.name, m, c] as const)))(
    '%s.%s stays readable by every role',
    (_name, method, controller) => {
      expect(rolesOf(controller, method)).toBeUndefined();
    },
  );

  it('lets agents see and resolve payments that need attention', () => {
    for (const method of ['findNeedingAttention', 'resolve']) {
      expect(rolesOf(PaymentsController, method)).toEqual([
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.AGENT,
      ]);
    }
  });
});

describe('RolesGuard on an @AdminOnly route', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = ChannelsController.prototype.update;

  function contextFor(role: string) {
    return {
      getHandler: () => handler,
      getClass: () => ChannelsController,
      switchToHttp: () => ({ getRequest: () => ({ tenant: { organization_id: 'org', user_id: 'u', role } }) }),
    } as never;
  }

  it.each(['owner', 'admin'])('lets %s through', (role) => {
    expect(guard.canActivate(contextFor(role))).toBe(true);
  });

  it.each(['agent', 'viewer', 'api_key'])('rejects %s with 403', (role) => {
    expect(() => guard.canActivate(contextFor(role))).toThrow('Insufficient role');
  });
});
