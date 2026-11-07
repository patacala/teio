import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { communicationsService } from './communications.service';

const templateBody = {
  event_type: 'appointment.created',
  channel_type: 'email',
  provider: 'resend',
  provider_template_id: 'tmpl_123',
  priority: 1,
};

describe('communicationsService', () => {
  describe('org templates', () => {
    itCallsEndpoints([
      { name: 'getTemplates without filters', call: () => communicationsService.getTemplates(), method: 'get', path: '/communications/templates' },
      {
        name: 'getTemplates with filters',
        call: () => communicationsService.getTemplates({ event_type: 'appointment.created', channel_type: 'sms' }),
        method: 'get',
        path: '/communications/templates',
        query: { event_type: 'appointment.created', channel_type: 'sms' },
      },
      {
        name: 'createTemplate',
        call: () => communicationsService.createTemplate(templateBody),
        method: 'post',
        path: '/communications/templates',
        body: templateBody,
      },
      {
        name: 'updateTemplate',
        call: () => communicationsService.updateTemplate('t-1', { is_active: false }),
        method: 'patch',
        path: '/communications/templates/t-1',
        body: { is_active: false },
      },
      { name: 'deleteTemplate', call: () => communicationsService.deleteTemplate('t-1'), method: 'delete', path: '/communications/templates/t-1' },
      { name: 'getTemplateById', call: () => communicationsService.getTemplateById('t-1'), method: 'get', path: '/communications/templates/t-1' },
    ]);
  });

  describe('metadata and deliveries', () => {
    itCallsEndpoints([
      { name: 'getEventTypes', call: () => communicationsService.getEventTypes(), method: 'get', path: '/communications/templates/events' },
      {
        name: 'getPlatformEventTypes',
        call: () => communicationsService.getPlatformEventTypes(),
        method: 'get',
        path: '/communications/templates/events/platform',
      },
      {
        name: 'getDeliveries defaults to page 1 of 20',
        call: () => communicationsService.getDeliveries(),
        method: 'get',
        path: '/communications/deliveries',
        query: { page: '1', limit: '20' },
      },
      {
        name: 'getDeliveries with explicit page',
        call: () => communicationsService.getDeliveries(3, 50),
        method: 'get',
        path: '/communications/deliveries',
        query: { page: '3', limit: '50' },
      },
    ]);
  });

  describe('system templates', () => {
    itCallsEndpoints([
      {
        name: 'getSystemTemplates without filters',
        call: () => communicationsService.getSystemTemplates(),
        method: 'get',
        path: '/communications/templates/system',
      },
      {
        name: 'getSystemTemplates with an event filter',
        call: () => communicationsService.getSystemTemplates({ event_type: 'billing.failed' }),
        method: 'get',
        path: '/communications/templates/system',
        query: { event_type: 'billing.failed' },
      },
      {
        name: 'getSystemTemplateById',
        call: () => communicationsService.getSystemTemplateById('s-1'),
        method: 'get',
        path: '/communications/templates/system/s-1',
      },
      {
        name: 'createSystemTemplate',
        call: () => communicationsService.createSystemTemplate(templateBody),
        method: 'post',
        path: '/communications/templates/system',
        body: templateBody,
      },
      {
        name: 'updateSystemTemplate',
        call: () => communicationsService.updateSystemTemplate('s-1', { name: 'Billing failed' }),
        method: 'patch',
        path: '/communications/templates/system/s-1',
        body: { name: 'Billing failed' },
      },
      {
        name: 'deleteSystemTemplate',
        call: () => communicationsService.deleteSystemTemplate('s-1'),
        method: 'delete',
        path: '/communications/templates/system/s-1',
      },
    ]);
  });
});
