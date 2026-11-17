import { authClient } from '@/lib/auth-client';
import type {
  PaginatedResponse,
  PlatformAttention,
  PlatformLead,
  PlatformLeadSourceFilter,
  PlatformOrganizationFilter,
  PlatformOrganizationSort,
  PlatformOrganizationsPage,
  PlatformOverview,
  PlatformRange,
} from '@crm/shared';
import type { CustomDateRange } from '@/services/analytics.service';

export interface PlatformLeadsParams {
  source?: PlatformLeadSourceFilter;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PlatformOrganizationsParams {
  filter?: PlatformOrganizationFilter;
  sort?: PlatformOrganizationSort;
  search?: string;
  page?: number;
  limit?: number;
}

function pageQuery({ search, page = 1, limit = 10 }: { search?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search?.trim()) qs.set('search', search.trim());
  return qs;
}

export const platformAnalyticsService = {
  /** A custom period (both days inclusive) replaces the range. */
  getOverview: (range: PlatformRange = '30d', custom?: CustomDateRange) => {
    const qs = custom ? new URLSearchParams({ from: custom.from, to: custom.to }) : new URLSearchParams({ range });
    return authClient.get<PlatformOverview>(`/platform/analytics/overview?${qs}`);
  },

  getAttention: () => authClient.get<PlatformAttention>('/platform/analytics/attention'),

  getLeads: ({ source = 'all', ...params }: PlatformLeadsParams = {}) => {
    const qs = pageQuery(params);
    if (source !== 'all') qs.set('source', source);
    return authClient.get<PaginatedResponse<PlatformLead>>(`/platform/analytics/leads?${qs}`);
  },

  getOrganizations: ({ filter = 'all', sort = 'mrr', ...params }: PlatformOrganizationsParams = {}) => {
    const qs = pageQuery(params);
    if (filter !== 'all') qs.set('filter', filter);
    if (sort !== 'mrr') qs.set('sort', sort);
    return authClient.get<PlatformOrganizationsPage>(`/platform/analytics/organizations?${qs}`);
  },
};
