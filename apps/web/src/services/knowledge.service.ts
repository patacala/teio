import { authClient } from '@/lib/auth-client';
import type { PaginatedResponse } from '@crm/shared';

export interface KnowledgeEntry {
  id: string;
  organization_id: string;
  title: string;
  content: string;
  category: string;
  status: 'active' | 'inactive';
  prosales_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeMetrics {
  total: number;
  active: number;
  inactive: number;
  categories_count: number;
}

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  score: number;
}

export type KnowledgeListResponse = PaginatedResponse<KnowledgeEntry>;

export interface KnowledgeListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
}

export interface CreateKnowledgeEntryBody {
  title: string;
  content: string;
  category?: string;
  status?: 'active' | 'inactive';
}

export interface UpdateKnowledgeEntryBody {
  title?: string;
  content?: string;
  category?: string;
  status?: 'active' | 'inactive';
}

export const knowledgeService = {
  getMetrics: () => authClient.get<KnowledgeMetrics>('/knowledge/metrics'),

  search: (q: string) =>
    authClient.get<KnowledgeSearchResult[]>(`/knowledge/search?q=${encodeURIComponent(q)}`),

  getEntries: (params?: KnowledgeListParams) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    const query = qs.toString();
    return authClient.get<KnowledgeListResponse>(`/knowledge${query ? `?${query}` : ''}`);
  },

  getEntry: (id: string) => authClient.get<KnowledgeEntry>(`/knowledge/${id}`),

  createEntry: (body: CreateKnowledgeEntryBody) => authClient.post<KnowledgeEntry>('/knowledge', body),

  updateEntry: (id: string, body: UpdateKnowledgeEntryBody) =>
    authClient.patch<KnowledgeEntry>(`/knowledge/${id}`, body),

  deleteEntry: (id: string) => authClient.delete<void>(`/knowledge/${id}`),

  toggleEntry: (id: string) => authClient.post<KnowledgeEntry>(`/knowledge/${id}/toggle`, {}),

  reindex: () =>
    authClient.post<{
      reindexed: number;
      failed: number;
      failures: { id: string; title: string; error: string }[];
    }>('/knowledge/reindex', {}),

  uploadFile: (file: File, opts?: { title?: string; category?: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (opts?.title) formData.append('title', opts.title);
    if (opts?.category) formData.append('category', opts.category);
    return authClient.uploadFile<KnowledgeEntry>('/knowledge/upload', formData);
  },
};
