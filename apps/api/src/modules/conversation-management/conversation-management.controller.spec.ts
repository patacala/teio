import { ConversationManagementController } from './conversation-management.controller';
import type { ConversationManagementService } from './conversation-management.service';
import type { TenantContext } from '@crm/shared';

describe('ConversationManagementController.create', () => {
  it('reuses the contact’s existing open conversation on that channel instead of inserting a duplicate', async () => {
    const existing = { id: 'conv-1', channel: 'whatsapp' };
    const findOrCreateActiveConversation = jest.fn().mockResolvedValue({ conversation: existing, created: false });
    const controller = new ConversationManagementController(
      { findOrCreateActiveConversation } as unknown as ConversationManagementService,
    );

    const result = await controller.create(
      { contact_id: 'contact-1', channel: 'whatsapp' },
      { organization_id: 'org-1' } as TenantContext,
    );

    expect(findOrCreateActiveConversation).toHaveBeenCalledWith('org-1', 'contact-1', '', 'whatsapp');
    expect(result).toBe(existing);
  });
});
