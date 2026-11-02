import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../infrastructure/mail/mail.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { CommunicationTemplateService } from './communication-template.service';
import { CommunicationDeliveryEntity } from './communication-delivery.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import type { DispatchRequest, DispatchResult } from '@crm/shared';

@Injectable()
export class CommunicationDispatchService {
  private readonly logger = new Logger(CommunicationDispatchService.name);

  constructor(
    private readonly templateService: CommunicationTemplateService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly config: ConfigService,
    @InjectRepository(CommunicationDeliveryEntity)
    private readonly deliveryRepo: Repository<CommunicationDeliveryEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
  ) {}

  async dispatch(request: DispatchRequest): Promise<DispatchResult> {
    // Load org for branding and notification preferences
    const org = await this.orgRepo.findOne({ where: { id: request.organizationId } });
    const settings = (org?.settings ?? {}) as Record<string, any>;
    const branding = (settings.branding ?? {}) as Record<string, string>;
    const notificationPrefs = (settings.notification_preferences ?? {}) as Record<string, { enabled: boolean }>;

    // Check if this event type is disabled
    if (notificationPrefs[request.eventType]?.enabled === false) {
      this.logger.log(`Notification for ${request.eventType} disabled by org ${request.organizationId}`);
      return { dispatched: false };
    }

    const template = await this.templateService.resolveTemplate(
      request.organizationId,
      request.eventType,
      request.channelType,
    );

    if (!template) {
      return { dispatched: false };
    }

    // Enrich variables with branding
    const brandingVars: Record<string, string> = {
      organization_name: org?.name ?? '',
      logo_url: branding.logo_url ?? '',
      primary_color: branding.primary_color ?? '#2563EB',
      accent_color: branding.accent_color ?? '#10B981',
      from_name: branding.from_name ?? org?.name ?? '',
      support_email: branding.support_email ?? '',
      website_url: branding.website_url ?? '',
    };
    const enrichedVariables = { ...brandingVars, ...(request.variables ?? {}) };

    // Create delivery record
    const delivery = this.deliveryRepo.create({
      organization_id: request.organizationId,
      communication_template_id: template.id,
      event_type: request.eventType,
      channel_type: request.channelType,
      provider: template.provider,
      recipient: request.recipient,
      provider_template_id: template.provider_template_id,
      variables: enrichedVariables,
      status: 'pending',
    });
    const saved = await this.deliveryRepo.save(delivery);

    try {
      if (request.channelType === 'sms') {
        // For SMS, provider_template_id holds the message template text with {{var}} placeholders
        let text = template.provider_template_id ?? '';
        for (const [key, value] of Object.entries(enrichedVariables)) {
          text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }

        const result = await this.smsService.send({
          to: request.recipient,
          text,
        });

        saved.status = 'sent';
        saved.provider_message_id = result.providerId;
        await this.deliveryRepo.save(saved);

        this.logger.log(
          `Dispatched ${request.eventType} SMS to ${request.recipient} via template ${template.id}`,
        );
      } else {
        const from = template.from_override ?? branding.from_email ?? request.fromOverride ?? undefined;
        const subject = request.subject ?? template.name ?? request.eventType;

        await this.mailService.send({
          to: request.recipient,
          from,
          subject,
          templateId: template.provider_template_id,
          variables: enrichedVariables,
          attachments: request.attachments,
        });

        saved.status = 'sent';
        await this.deliveryRepo.save(saved);

        this.logger.log(
          `Dispatched ${request.eventType} email to ${request.recipient} via template ${template.id}`,
        );
      }

      return { dispatched: true, deliveryId: saved.id };
    } catch (err) {
      saved.status = 'failed';
      saved.error_message = (err as Error).message;
      await this.deliveryRepo.save(saved);

      this.logger.warn(
        `Failed to dispatch ${request.eventType} to ${request.recipient}: ${(err as Error).message}`,
      );

      return { dispatched: false, deliveryId: saved.id, error: (err as Error).message };
    }
  }

  async findDeliveries(
    orgId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: CommunicationDeliveryEntity[]; total: number }> {
    const [items, total] = await this.deliveryRepo.findAndCount({
      where: { organization_id: orgId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}
