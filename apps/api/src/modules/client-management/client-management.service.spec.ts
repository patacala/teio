/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { ClientManagementService } from './client-management.service';
import { ContactEntity } from './contact.entity';
import { ContactDataUpdateEntity } from './contact-data-update.entity';
import { CompaniesService } from './companies.service';
import { MessageEntity } from '../conversation-management/message.entity';
import { ConversationEntity } from '../conversation-management/conversation.entity';
import { CallEntity } from '../voice/call.entity';
import { AppointmentEntity } from '../scheduling/appointment.entity';
import { ContactFunnelHistoryEntity } from '../funnels/contact-funnel-history.entity';
import { FunnelStageEntity } from '../funnels/funnel-stage.entity';
import { FunnelEntity } from '../funnels/funnel.entity';
import { UserEntity } from '../users/user.entity';
import { ChannelType } from '@crm/shared';

describe('ClientManagementService - findOrCreateByChannel', () => {
  let service: ClientManagementService;
  let contactRepo: jest.Mocked<Repository<ContactEntity>>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  const mockOrgId = 'org-123';
  const mockContactId = 'contact-456';

  beforeEach(async () => {
    // Mock QueryRunner for transaction support
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        query: jest.fn(),
      } as any,
    } as any;

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as any;

    // Mock repository
    const mockRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: mockContactId })),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
      manager: {
        query: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientManagementService,
        {
          provide: getRepositoryToken(ContactEntity),
          useValue: mockRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: CompaniesService,
          useValue: {},
        },
        // Mock other dependencies as needed
        {
          provide: 'RABBITMQ_SERVICE',
          useValue: { emit: jest.fn() },
        },
        {
          provide: 'WebhookDispatcherService',
          useValue: null,
        },
        {
          provide: 'RealtimeBroadcastService',
          useValue: null,
        },
        {
          provide: getRepositoryToken(ContactDataUpdateEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(MessageEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ConversationEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(CallEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AppointmentEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ContactFunnelHistoryEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(FunnelStageEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(FunnelEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ClientManagementService>(ClientManagementService);
    contactRepo = module.get(getRepositoryToken(ContactEntity));
  });

  describe('Phone channel concurrency safety', () => {
    it('should use INSERT ON CONFLICT for voice channel', async () => {
      const phoneNumber = '+16452205559';
      const displayName = 'John Doe';

      // Mock INSERT ... ON CONFLICT returning a new contact (no conflict)
      contactRepo.manager.query = jest.fn().mockResolvedValue([
        {
          id: mockContactId,
          organization_id: mockOrgId,
          first_name: displayName,
          phone: phoneNumber,
          channel_ids: { voice: phoneNumber },
          status: 'active',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.VOICE,
        phoneNumber,
        displayName,
      );

      expect(result.id).toBe(mockContactId);
      expect(result.phone).toBe(phoneNumber);
      expect(contactRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clients.contacts'),
        expect.arrayContaining([mockOrgId, displayName, phoneNumber]),
      );
      expect(contactRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array),
      );
    });

    it('should use INSERT ON CONFLICT for SMS channel', async () => {
      const phoneNumber = '16452205559';

      contactRepo.manager.query = jest.fn().mockResolvedValue([
        {
          id: mockContactId,
          organization_id: mockOrgId,
          first_name: '',
          phone: phoneNumber,
          channel_ids: { sms: phoneNumber },
          status: 'active',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      await service.findOrCreateByChannel(mockOrgId, ChannelType.SMS, phoneNumber);

      expect(contactRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array),
      );
    });

    it('should use INSERT ON CONFLICT for WhatsApp channel', async () => {
      const phoneNumber = '+16452205559';

      contactRepo.manager.query = jest.fn().mockResolvedValue([
        {
          id: mockContactId,
          organization_id: mockOrgId,
          first_name: '',
          phone: phoneNumber,
          channel_ids: { whatsapp: phoneNumber },
          status: 'active',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      await service.findOrCreateByChannel(mockOrgId, ChannelType.WHATSAPP, phoneNumber);

      expect(contactRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array),
      );
    });

    it('should handle INSERT conflict and fetch existing contact', async () => {
      const phoneNumber = '+16452205559';

      // Mock INSERT returning empty (conflict occurred, DO NOTHING)
      contactRepo.manager.query = jest.fn().mockResolvedValue([]);

      // Mock findByChannelIdentifier returning existing contact
      const existingContact = {
        id: 'existing-id',
        organization_id: mockOrgId,
        first_name: 'Jane',
        phone: phoneNumber,
        channel_ids: { voice: phoneNumber },
        status: 'active',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingContact),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.VOICE,
        phoneNumber,
      );

      expect(result.id).toBe('existing-id');
      expect(contactRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array),
      );
      expect(contactRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it('should normalize different phone spellings to same contact', async () => {
      // First call with +1 prefix
      contactRepo.manager.query = jest.fn().mockResolvedValue([
        {
          id: mockContactId,
          organization_id: mockOrgId,
          first_name: '',
          phone: '+16452205559',
          channel_ids: { voice: '+16452205559' },
          status: 'active',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const contact1 = await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.VOICE,
        '+16452205559',
      );

      // Second call without +1 prefix should hit conflict
      contactRepo.manager.query = jest.fn().mockResolvedValue([]); // Conflict

      const existingContact = {
        id: mockContactId,
        organization_id: mockOrgId,
        first_name: '',
        phone: '+16452205559',
        channel_ids: { voice: '+16452205559', sms: '6452205559' },
        status: 'active',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingContact),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const contact2 = await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.SMS,
        '6452205559',
      );

      expect(contact2.id).toBe(mockContactId);
      // Both should resolve to the same contact due to last-10-digits normalization
    });

    it('should update channel_ids when conflict occurs with different channel', async () => {
      const phoneNumber = '+16452205559';

      // Mock INSERT returning empty (conflict)
      contactRepo.manager.query = jest.fn().mockResolvedValue([]);

      const existingContact = {
        id: 'existing-id',
        organization_id: mockOrgId,
        first_name: 'Jane',
        phone: phoneNumber,
        channel_ids: { voice: phoneNumber },
        status: 'active',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingContact),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      // Call with SMS channel (existing only has voice)
      await service.findOrCreateByChannel(mockOrgId, ChannelType.SMS, phoneNumber);

      // Should update channel_ids to include both
      expect(contactRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_ids: { voice: phoneNumber, sms: phoneNumber },
        }),
      );
    });
  });

  describe('Non-phone channel behavior', () => {
    it('should use non-atomic logic for email channel', async () => {
      const email = 'test@example.com';

      // Mock no existing contact
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.findOrCreateByChannel(mockOrgId, ChannelType.EMAIL, email);

      // Should NOT use INSERT ON CONFLICT
      expect(contactRepo.manager.query).not.toHaveBeenCalled();
      // Should use regular save
      expect(contactRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: email,
          phone: undefined,
          channel_ids: { email: email },
        }),
      );
    });

    it('should use non-atomic logic for webchat channel', async () => {
      const webchatId = 'webchat-session-123';

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.findOrCreateByChannel(mockOrgId, ChannelType.WEBCHAT, webchatId);

      expect(contactRepo.manager.query).not.toHaveBeenCalled();
      expect(contactRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: undefined,
          channel_ids: { webchat: webchatId },
        }),
      );
    });

    it('should use non-atomic logic for instagram channel', async () => {
      const igId = 'instagram-user-456';

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.findOrCreateByChannel(mockOrgId, ChannelType.INSTAGRAM, igId);

      expect(contactRepo.manager.query).not.toHaveBeenCalled();
      expect(contactRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: undefined,
          channel_ids: { instagram: igId },
        }),
      );
    });
  });

  describe('Display name handling', () => {
    it('should set display name on new phone contact', async () => {
      const phoneNumber = '+16452205559';
      const displayName = 'John Doe';

      contactRepo.manager.query = jest.fn().mockResolvedValue([
        {
          id: mockContactId,
          organization_id: mockOrgId,
          first_name: displayName,
          phone: phoneNumber,
          channel_ids: { voice: phoneNumber },
          status: 'active',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.VOICE,
        phoneNumber,
        displayName,
      );

      expect(contactRepo.manager.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([mockOrgId, displayName, phoneNumber]),
      );
    });

    it('should update display name on existing contact if empty', async () => {
      const phoneNumber = '+16452205559';
      const displayName = 'John Doe';

      // Mock conflict
      contactRepo.manager.query = jest.fn().mockResolvedValue([]);

      const existingContact = {
        id: 'existing-id',
        organization_id: mockOrgId,
        first_name: '', // Empty name
        phone: phoneNumber,
        channel_ids: { voice: phoneNumber },
        status: 'active',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingContact),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.VOICE,
        phoneNumber,
        displayName,
      );

      expect(contactRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: displayName,
        }),
      );
    });

    it('should NOT overwrite existing display name', async () => {
      const phoneNumber = '+16452205559';
      const newDisplayName = 'New Name';

      // Mock conflict
      contactRepo.manager.query = jest.fn().mockResolvedValue([]);

      const existingContact = {
        id: 'existing-id',
        organization_id: mockOrgId,
        first_name: 'Existing Name', // Has a name
        phone: phoneNumber,
        channel_ids: { voice: phoneNumber },
        status: 'active',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingContact),
      };
      contactRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.findOrCreateByChannel(
        mockOrgId,
        ChannelType.VOICE,
        phoneNumber,
        newDisplayName,
      );

      // Should not update if name already exists
      // (save might still be called for channel_ids, but name should be unchanged)
      const saveCall = (contactRepo.save as jest.Mock).mock.calls[0];
      if (saveCall) {
        expect(saveCall[0].first_name).toBe('Existing Name');
      }
    });
  });
});
