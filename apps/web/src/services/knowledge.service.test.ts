import { describe, expect, it, vi } from 'vitest';
import { API_BASE, itCallsEndpoints } from '@/test/msw/api';
import { TEST_ACCESS_TOKEN } from '@/test/supabase';
import { knowledgeService } from './knowledge.service';

describe('knowledgeService', () => {
  itCallsEndpoints([
    { name: 'getMetrics', call: () => knowledgeService.getMetrics(), method: 'get', path: '/knowledge/metrics' },
    {
      name: 'search encodes the query',
      call: () => knowledgeService.search('precios & horarios?'),
      method: 'get',
      path: '/knowledge/search',
      query: { q: 'precios & horarios?' },
    },
    { name: 'getEntries without params', call: () => knowledgeService.getEntries(), method: 'get', path: '/knowledge' },
    {
      name: 'getEntries with filters',
      call: () => knowledgeService.getEntries({ page: 2, limit: 10, search: 'faq', status: 'active', category: 'pricing' }),
      method: 'get',
      path: '/knowledge',
      query: { page: '2', limit: '10', search: 'faq', status: 'active', category: 'pricing' },
    },
    { name: 'getEntry', call: () => knowledgeService.getEntry('k-1'), method: 'get', path: '/knowledge/k-1' },
    {
      name: 'createEntry',
      call: () => knowledgeService.createEntry({ title: 'Hours', content: 'Mon-Fri 9-6', category: 'general' }),
      method: 'post',
      path: '/knowledge',
      body: { title: 'Hours', content: 'Mon-Fri 9-6', category: 'general' },
    },
    {
      name: 'updateEntry',
      call: () => knowledgeService.updateEntry('k-1', { status: 'inactive' }),
      method: 'patch',
      path: '/knowledge/k-1',
      body: { status: 'inactive' },
    },
    { name: 'deleteEntry', call: () => knowledgeService.deleteEntry('k-1'), method: 'delete', path: '/knowledge/k-1' },
    { name: 'toggleEntry', call: () => knowledgeService.toggleEntry('k-1'), method: 'post', path: '/knowledge/k-1/toggle', body: {} },
    { name: 'reindex', call: () => knowledgeService.reindex(), method: 'post', path: '/knowledge/reindex', body: {} },
  ]);

  describe('uploadFile', () => {
    // jsdom's File/FormData cannot be serialized by Node's fetch, so these
    // tests inspect the request the service hands to fetch instead of MSW.
    function spyOnFetch(data: unknown) {
      return vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ data }));
    }

    it('posts the file and optional fields as multipart form data', async () => {
      const fetchSpy = spyOnFetch({ id: 'k-9', title: 'Price list' });
      const file = new File(['name,price\nCut,20'], 'prices.csv', { type: 'text/csv' });

      const entry = await knowledgeService.uploadFile(file, { title: 'Price list', category: 'pricing' });

      expect(entry).toEqual({ id: 'k-9', title: 'Price list' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_BASE}/knowledge/upload`);
      expect(init.method).toBe('POST');
      expect(init.headers).not.toHaveProperty('Content-Type');
      expect(init.headers).toHaveProperty('Authorization', `Bearer ${TEST_ACCESS_TOKEN}`);
      const form = init.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get('file')).toBe(file);
      expect(form.get('title')).toBe('Price list');
      expect(form.get('category')).toBe('pricing');
    });

    it('omits title and category when not provided', async () => {
      const fetchSpy = spyOnFetch({ id: 'k-9' });

      await knowledgeService.uploadFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));

      const form = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
      expect([...form.keys()]).toEqual(['file']);
    });
  });
});
