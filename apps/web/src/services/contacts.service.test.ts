import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { contactsService } from './contacts.service';

describe('contactsService', () => {
  itCallsEndpoints([
    { name: 'getContacts without params', call: () => contactsService.getContacts(), method: 'get', path: '/contacts' },
    {
      name: 'getContacts with filters',
      call: () => contactsService.getContacts({ search: 'ana', page: 3, limit: 50, tag: 'vip', stage_id: 's-1' }),
      method: 'get',
      path: '/contacts',
      query: { search: 'ana', page: '3', limit: '50', tag: 'vip', stage_id: 's-1' },
    },
    { name: 'getContact', call: () => contactsService.getContact('c-1'), method: 'get', path: '/contacts/c-1' },
    {
      name: 'createContact with a nested company',
      call: () =>
        contactsService.createContact({
          first_name: 'Ana',
          last_name: 'Pérez',
          phone: '+5215512345678',
          company: { name: 'Acme' },
        }),
      method: 'post',
      path: '/contacts',
      body: { first_name: 'Ana', last_name: 'Pérez', phone: '+5215512345678', company: { name: 'Acme' } },
    },
    {
      name: 'updateContact',
      call: () => contactsService.updateContact('c-1', { email: 'ana@acme.test' }),
      method: 'patch',
      path: '/contacts/c-1',
      body: { email: 'ana@acme.test' },
    },
    {
      name: 'getCapturedData',
      call: () => contactsService.getCapturedData('c-1'),
      method: 'get',
      path: '/contacts/c-1/captured-data',
    },
    {
      name: 'updateCapturedData wraps the fields',
      call: () => contactsService.updateCapturedData('c-1', { budget: '5000' }),
      method: 'patch',
      path: '/contacts/c-1/captured-data',
      body: { fields: { budget: '5000' } },
    },
    { name: 'addTag', call: () => contactsService.addTag('c-1', 'vip'), method: 'post', path: '/contacts/c-1/tags', body: { tag: 'vip' } },
    { name: 'removeTag', call: () => contactsService.removeTag('c-1', 'tag-1'), method: 'delete', path: '/contacts/c-1/tags/tag-1' },
    {
      name: 'updateLeadScore patches lead_score on the contact',
      call: () => contactsService.updateLeadScore('c-1', 85),
      method: 'patch',
      path: '/contacts/c-1',
      body: { lead_score: 85 },
    },
    { name: 'getStats', call: () => contactsService.getStats(), method: 'get', path: '/contacts/stats' },
    { name: 'exportContacts', call: () => contactsService.exportContacts(), method: 'get', path: '/contacts/export' },
    {
      name: 'getContactConversations',
      call: () => contactsService.getContactConversations('c-1'),
      method: 'get',
      path: '/contacts/c-1/messages',
    },
    { name: 'getContactCalls', call: () => contactsService.getContactCalls('c-1'), method: 'get', path: '/contacts/c-1/calls' },
    {
      name: 'getContactAppointments',
      call: () => contactsService.getContactAppointments('c-1'),
      method: 'get',
      path: '/contacts/c-1/appointments',
    },
    {
      name: 'updateStage maps to stage_id',
      call: () => contactsService.updateStage('c-1', 's-2'),
      method: 'patch',
      path: '/contacts/c-1/stage',
      body: { stage_id: 's-2' },
    },
  ]);

  it('returns the paginated contact list', async () => {
    const page = {
      items: [{ id: 'c-1', first_name: 'Ana', last_name: 'Pérez', created_at: '', updated_at: '' }],
      meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
    };
    mockApi('get', '/contacts', { data: page });

    await expect(contactsService.getContacts()).resolves.toEqual(page);
  });

  it('rejects with the API message on a duplicate contact', async () => {
    mockApi('post', '/contacts', { status: 409, message: 'A contact with this phone already exists' });

    await expect(contactsService.createContact({ phone: '+5215512345678' })).rejects.toThrow(
      'A contact with this phone already exists',
    );
  });
});
