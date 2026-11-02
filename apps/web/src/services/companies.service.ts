import { authClient } from '@/lib/auth-client';

export interface Company {
  id: string;
  organization_id: string;
  name: string;
  company_type?: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  website_screenshot?: string;
  logo?: string;
  demo_link?: string;
  company_context?: string;
  phone?: string;
  address?: Record<string, unknown>;
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface CompaniesPage {
  items: Company[];
  meta: PaginationMeta;
}

export interface CompanyListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCompanyDto {
  name: string;
  company_type?: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  website_screenshot?: string;
  logo?: string;
  demo_link?: string;
  company_context?: string;
  phone?: string;
  tags?: string[];
}

export type UpdateCompanyDto = Partial<CreateCompanyDto>;

export const companiesService = {
  getAll(params?: CompanyListParams): Promise<CompaniesPage> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return authClient.get<CompaniesPage>(`/companies?${qs.toString()}`);
  },

  getById(id: string): Promise<Company> {
    return authClient.get<Company>(`/companies/${id}`);
  },

  create(dto: CreateCompanyDto): Promise<Company> {
    return authClient.post<Company>('/companies', dto);
  },

  update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    return authClient.patch<Company>(`/companies/${id}`, dto);
  },

  delete(id: string): Promise<void> {
    return authClient.delete<void>(`/companies/${id}`);
  },
};
