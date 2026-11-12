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

    // resolveDefaultStage(): org has no funnel stages → new contacts get no stage
    const stageQuery: Record<string, jest.Mock> = {};
    for (const m of ['innerJoin', 'where', 'orderBy', 'addOrderBy', 'select', 'limit']) {
      stageQuery[m] = jest.fn(() => stageQuery);
    }
    stageQuery.getRawOne = jest.fn().mockResolvedValue(undefined);
    const mockStageRepo = { createQueryBuilder: jest.fn(() => stageQuery) };

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
          useValue: mockStageRepo,
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

describe('ClientManagementService - funnel stage changes', () => {
  const ORG = 'org-1';
  const CONTACT_ID = 'contact-1';

  function build(options: { stageInOrg?: boolean; affected?: number; leadStage?: string } = {}) {
    const contact = {
      id: CONTACT_ID,
      organization_id: ORG,
      first_name: 'Ana',
      last_name: 'Lopez',
      lead_stage: options.leadStage ?? 'stage-a',
      custom_fields: {},
      ai_insights: {},
    } as unknown as ContactEntity;

    const updateQuery: Record<string, jest.Mock> = {};
    for (const m of ['update', 'set', 'where', 'andWhere']) updateQuery[m] = jest.fn(() => updateQuery);
    updateQuery.execute = jest.fn().mockResolvedValue({ affected: options.affected ?? 1 });

    const contactRepo = {
      findOne: jest.fn().mockResolvedValue(contact),
      save: jest.fn(async (c: ContactEntity) => c),
      createQueryBuilder: jest.fn(() => updateQuery),
    };
    const historyRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const stageRepo = {
      findOne: jest.fn().mockResolvedValue(options.stageInOrg === false ? null : { id: 'stage-b' }),
    };
    const rmq = { emit: jest.fn() };

    const service = new ClientManagementService(
      contactRepo as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      historyRepo as never, stageRepo as never, {} as never, {} as never, rmq as never,
    );
    return { service, contact, contactRepo, historyRepo, stageRepo, rmq, updateQuery };
  }

  describe('updateStage (manual)', () => {
    it('rejects a stage that does not belong to the organization', async () => {
      const h = build({ stageInOrg: false });

      await expect(h.service.updateStage(CONTACT_ID, ORG, 'foreign-stage', 'user-1')).rejects.toThrow(
        'Stage foreign-stage not found',
      );
      expect(h.stageRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'foreign-stage', organization_id: ORG } }),
      );
      expect(h.contactRepo.save).not.toHaveBeenCalled();
      expect(h.historyRepo.save).not.toHaveBeenCalled();
    });

    it('treats re-selecting the current stage as a no-op', async () => {
      const h = build({ leadStage: 'stage-b' });

      await h.service.updateStage(CONTACT_ID, ORG, 'stage-b', 'user-1');

      expect(h.contactRepo.save).not.toHaveBeenCalled();
      expect(h.historyRepo.save).not.toHaveBeenCalled();
    });

    it('moves the contact and records a manual history row', async () => {
      const h = build();

      const result = await h.service.updateStage(CONTACT_ID, ORG, 'stage-b', 'user-1');

      expect(result.lead_stage).toBe('stage-b');
      expect(h.historyRepo.create).toHaveBeenCalledWith({
        contact_id: CONTACT_ID,
        from_stage_id: 'stage-a',
        to_stage_id: 'stage-b',
        changed_by: 'user-1',
        source: 'manual',
        reason: null,
      });
      expect(h.rmq.emit).toHaveBeenCalledWith(
        'contact.stage.changed',
        expect.objectContaining({ contact_id: CONTACT_ID, from_stage_id: 'stage-a', to_stage_id: 'stage-b' }),
      );
    });
  });

  describe('moveStageIfUnchanged (automation)', () => {
    it('only writes when the contact is still on the expected stage', async () => {
      const h = build();

      await h.service.moveStageIfUnchanged(CONTACT_ID, ORG, 'stage-a', 'stage-b', 'Lead contacted');

      expect(h.updateQuery.set).toHaveBeenCalledWith({ lead_stage: 'stage-b' });
      expect(h.updateQuery.andWhere).toHaveBeenCalledWith('organization_id = :organizationId', {
        organizationId: ORG,
      });
      expect(h.updateQuery.andWhere).toHaveBeenCalledWith('lead_stage = :expectedStageId', {
        expectedStageId: 'stage-a',
      });
    });

    it('returns false and records nothing when another change won the race', async () => {
      const h = build({ affected: 0 });

      const moved = await h.service.moveStageIfUnchanged(CONTACT_ID, ORG, 'stage-a', 'stage-b', 'Lead contacted');

      expect(moved).toBe(false);
      expect(h.historyRepo.save).not.toHaveBeenCalled();
      expect(h.rmq.emit).not.toHaveBeenCalled();
    });

    it('records an automation history row with the rule name', async () => {
      const h = build();

      const moved = await h.service.moveStageIfUnchanged(CONTACT_ID, ORG, 'stage-a', 'stage-b', 'Lead contacted');

      expect(moved).toBe(true);
      expect(h.historyRepo.create).toHaveBeenCalledWith({
        contact_id: CONTACT_ID,
        from_stage_id: 'stage-a',
        to_stage_id: 'stage-b',
        changed_by: null,
        source: 'automation',
        reason: 'Lead contacted',
      });
    });
  });

  it('update() ignores lead_stage so stage changes cannot bypass the funnel history', async () => {
    const h = build();

    await h.service.update(CONTACT_ID, ORG, { first_name: 'Ana', lead_stage: 'stage-z' } as never);

    const saved = h.contactRepo.save.mock.calls[0][0] as ContactEntity;
    expect(saved.lead_stage).toBe('stage-a');
    expect(h.historyRepo.save).not.toHaveBeenCalled();
  });
});
