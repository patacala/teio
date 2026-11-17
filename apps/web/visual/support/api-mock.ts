import type { Page, Route } from '@playwright/test';
import type {
  BillingAccess,
  BillingInvoice,
  BillingOverview,
  BillingPlan,
  DemoLimitDefaults,
  DemoOrganization,
  PlatformAttention,
  PlatformLead,
  PlatformOrganizationsPage,
  PlatformOverview,
} from '@crm/shared';
import { ORG_COMMUNICATION_EVENTS, PLATFORM_COMMUNICATION_EVENTS } from '@crm/shared';
import { billingAccess } from '@/test/fixtures/billing';
import { PLANS } from './data';
import type { FunnelScenario } from './funnel';
import { API_URL } from './env';
import { testUser } from './session';

/** `pending` never answers (loading states); `error` answers 500. */
export type Mocked<T> = T | 'pending' | 'error';

export interface CurrentUser {
  role: 'owner' | 'admin' | 'agent';
  is_platform_admin?: boolean;
  full_name?: string;
}

export interface Scenario {
  user: CurrentUser;
  access?: BillingAccess;
  overview?: Mocked<BillingOverview>;
  plans?: Mocked<BillingPlan[]>;
  invoices?: Mocked<BillingInvoice[]>;
  demoDefaults?: Mocked<DemoLimitDefaults>;
  demoOrganizations?: Mocked<DemoOrganization[]>;
  funnel?: FunnelScenario;
  platformOverview?: Mocked<PlatformOverview>;
  platformAttention?: Mocked<PlatformAttention>;
  platformLeads?: Mocked<PlatformLead[]>;
  platformOrganizations?: Mocked<PlatformOrganizationsPage>;
}

export const ORG_ID = '22222222-bbbb-4bbb-8bbb-222222222222';

const TEAM = [
  { id: 'member-1', full_name: 'Olivia Owner', email: 'olivia@acme.test', role: 'owner' },
  { id: 'member-2', full_name: 'Andy Agent', email: 'andy@acme.test', role: 'agent' },
  { id: 'member-3', full_name: 'Ada Admin', email: 'ada@acme.test', role: 'admin' },
].map((m) => ({
  ...m,
  organization_id: ORG_ID,
  is_active: true,
  created_at: '2026-01-05T09:00:00.000Z',
  updated_at: '2026-01-05T09:00:00.000Z',
}));

const SYSTEM_TEMPLATES = [
  ['tpl-1', 'appointment_created', 'email', 'Appointment Created'],
  ['tpl-2', 'appointment_reminder', 'sms', 'Appointment Reminder'],
  ['tpl-3', 'welcome', 'email', 'Welcome'],
].map(([id, event_type, channel_type, name]) => ({
  id,
  organization_id: null,
  event_type,
  channel_type,
  provider: channel_type === 'email' ? 'resend' : 'telnyx',
  provider_template_id: `tpl_${event_type}`,
  name,
  description: null,
  is_active: true,
  is_system: true,
  priority: 0,
  created_at: '2026-01-05T09:00:00.000Z',
  updated_at: '2026-01-05T09:00:00.000Z',
}));

function paginated<T>(items: T[]) {
  return { items, meta: { total: items.length, page: 1, limit: 20, total_pages: 1, has_next: false, has_prev: false } };
}

/**
 * Serves every API call the app makes from `scenario`. Unexpected endpoints
 * get an empty list and are recorded so tests can surface them.
 */
export async function mockApi(page: Page, scenario: Scenario): Promise<{ unexpected: string[] }> {
  const unexpected: string[] = [];
  const user = {
    id: 'member-1',
    auth_user_id: testUser.id,
    organization_id: ORG_ID,
    email: testUser.email,
    full_name: scenario.user.full_name ?? 'Olivia Owner',
    role: scenario.user.role,
    is_active: true,
    is_platform_admin: scenario.user.is_platform_admin ?? false,
    created_at: '2026-01-05T09:00:00.000Z',
    updated_at: '2026-01-05T09:00:00.000Z',
  };

  const respond = async (route: Route, value: unknown) => {
    if (value === 'pending') return; // never fulfilled: keeps the UI in its loading state
    if (value === 'error') {
      return route.fulfill({ status: 500, json: { statusCode: 500, message: 'Service temporarily unavailable' } });
    }
    return route.fulfill({ json: { data: value, timestamp: '2026-06-15T12:00:00.000Z' } });
  };

  await page.route(`${API_URL}/api/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (method !== 'GET') return respond(route, {});

    const mockList = <T>(value: Mocked<T[]> | undefined, fallback: T[] = []) =>
      value === 'pending' || value === 'error' ? value : paginated(value ?? fallback);

    switch (path) {
      case '/users/me':
        return respond(route, user);
      case '/users':
        return respond(route, TEAM);
      case '/organizations/me':
        return respond(route, { id: ORG_ID, name: 'Acme Dental', slug: 'acme-dental', plan: 'free', is_active: true, settings: {} });
      case '/organizations':
        return respond(route, [{ id: ORG_ID, name: 'Acme Dental', slug: 'acme-dental', plan: 'free', is_active: true, created_at: '2026-01-05T09:00:00.000Z' }]);
      case '/billing/status':
        return respond(route, scenario.access ?? billingAccess());
      case '/billing/subscription':
        return respond(route, scenario.overview);
      case '/billing/plans':
        return respond(route, scenario.plans ?? PLANS);
      case '/billing/invoices':
        return respond(route, mockList(scenario.invoices));
      case '/platform/billing/demo/defaults':
        return respond(route, scenario.demoDefaults);
      case '/platform/billing/demo/organizations':
        return respond(route, mockList(scenario.demoOrganizations));
      case '/platform/analytics/overview':
        return respond(route, scenario.platformOverview);
      case '/platform/analytics/attention':
        return respond(route, scenario.platformAttention);
      case '/platform/analytics/leads':
        return respond(route, mockList(scenario.platformLeads));
      case '/platform/analytics/organizations':
        return respond(route, scenario.platformOrganizations);
      case '/communications/templates/system':
        return respond(route, SYSTEM_TEMPLATES);
      case '/communications/templates/events':
        return respond(route, ORG_COMMUNICATION_EVENTS);
      case '/communications/templates/events/platform':
        return respond(route, PLATFORM_COMMUNICATION_EVENTS);
      case '/communications/deliveries':
        return respond(route, { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      case '/communications/templates':
        return respond(route, []);
      case '/conversations':
        return respond(route, paginated([]));
      case '/contacts': {
        const stageId = url.searchParams.get('stage_id');
        const all = scenario.funnel?.contacts ?? [];
        const items = stageId ? all.filter((c) => c.lead_stage === stageId) : all;
        const limit = Number(url.searchParams.get('limit') ?? 20);
        return respond(route, {
          items: items.slice(0, limit),
          meta: { total: items.length, page: 1, limit, total_pages: Math.ceil(items.length / limit), has_next: items.length > limit, has_prev: false },
        });
      }
      case '/funnels':
        return respond(route, scenario.funnel?.funnels ?? []);
      case '/funnels/templates':
        return respond(route, scenario.funnel?.templates ?? []);
      case '/funnels/stages':
        return respond(route, scenario.funnel?.stages ?? []);
      case '/ai-agents':
        return respond(route, []);
      case '/payments/services':
      case '/payments':
        return respond(route, []);
      case '/payments/settings':
        return respond(route, {
          currency: 'usd',
          is_connected: true,
          stripe_secret_key: '••••4242',
          stripe_webhook_secret: '••••a1b2',
          webhook_url: `https://api.acme.test/api/v1/webhooks/payments/stripe/${ORG_ID}`,
          updated_at: '2026-06-01T00:00:00.000Z',
        });
      default: {
        const funnelStages = path.match(/^\/funnels\/([^/]+)\/stages$/);
        if (funnelStages) {
          return respond(route, (scenario.funnel?.stages ?? []).filter((st) => st.funnel_id === funnelStages[1]));
        }
        unexpected.push(`${method} ${path}`);
        return respond(route, []);
      }
    }
  });

  // Supabase Realtime: keep the socket open but silent.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => undefined);

  return { unexpected };
}
