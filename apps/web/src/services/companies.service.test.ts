import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { companiesService } from './companies.service';

describe('companiesService', () => {
  itCallsEndpoints([
    { name: 'getAll without params', call: () => companiesService.getAll(), method: 'get', path: '/companies' },
    {
      name: 'getAll with search and pagination',
      call: () => companiesService.getAll({ search: 'acme', page: 2, limit: 10 }),
      method: 'get',
      path: '/companies',
      query: { search: 'acme', page: '2', limit: '10' },
    },
    {
      name: 'getAll skips an empty search',
      call: () => companiesService.getAll({ search: '', page: 1 }),
      method: 'get',
      path: '/companies',
      query: { page: '1' },
    },
    { name: 'getById', call: () => companiesService.getById('co-1'), method: 'get', path: '/companies/co-1' },
    {
      name: 'create',
      call: () => companiesService.create({ name: 'Acme', domain: 'acme.test', tags: ['vip'] }),
      method: 'post',
      path: '/companies',
      body: { name: 'Acme', domain: 'acme.test', tags: ['vip'] },
    },
    {
      name: 'update',
      call: () => companiesService.update('co-1', { industry: 'Retail' }),
      method: 'patch',
      path: '/companies/co-1',
      body: { industry: 'Retail' },
    },
    { name: 'delete', call: () => companiesService.delete('co-1'), method: 'delete', path: '/companies/co-1' },
  ]);
});
