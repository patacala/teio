import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { PaymentSettingsEntity } from './entities/payment-settings.entity';
import type { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';

function mask(secret: string | null): string | null {
  if (!secret) return null;
  return secret.length <= 4 ? '••••' : `••••${secret.slice(-4)}`;
}

@Injectable()
export class PaymentSettingsService {
  constructor(
    @InjectRepository(PaymentSettingsEntity)
    private readonly settingsRepo: Repository<PaymentSettingsEntity>,
    private readonly config: ConfigService,
  ) {}

  /** Computed server-side so the frontend never has to know/guess the organization id. */
  private buildWebhookUrl(organizationId: string): string {
    const baseUrl = this.config.get<string>('webhooks.baseUrl', 'http://localhost:3001');
    return `${baseUrl}/api/v1/webhooks/payments/stripe/${organizationId}`;
  }

  /** Ensures a settings row exists for the org (created lazily, all fields empty). */
  async getOrCreate(organizationId: string): Promise<PaymentSettingsEntity> {
    let settings = await this.settingsRepo.findOne({ where: { organization_id: organizationId } });
    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ organization_id: organizationId }),
      );
    }
    return settings;
  }

  /** Safe to return to the frontend — secrets are masked, never round-tripped in full. */
  async getMasked(organizationId: string): Promise<Record<string, unknown>> {
    const settings = await this.getOrCreate(organizationId);
    return {
      currency: settings.currency,
      is_connected: settings.is_connected,
      stripe_secret_key: mask(settings.stripe_secret_key),
      stripe_webhook_secret: mask(settings.stripe_webhook_secret),
      webhook_url: this.buildWebhookUrl(organizationId),
      updated_at: settings.updated_at,
    };
  }

  async update(
    organizationId: string,
    dto: UpdatePaymentSettingsDto,
  ): Promise<Record<string, unknown>> {
    const settings = await this.getOrCreate(organizationId);

    if (dto.stripe_secret_key) settings.stripe_secret_key = dto.stripe_secret_key;
    if (dto.stripe_webhook_secret) settings.stripe_webhook_secret = dto.stripe_webhook_secret;
    if (dto.currency) settings.currency = dto.currency.toLowerCase();

    settings.is_connected = Boolean(settings.stripe_secret_key);

    await this.settingsRepo.save(settings);
    return this.getMasked(organizationId);
  }

  /** Raw row for internal server-side use only (Stripe client, webhook verification). Never expose via API. */
  async getRaw(organizationId: string): Promise<PaymentSettingsEntity> {
    return this.getOrCreate(organizationId);
  }

  async getStripeClient(organizationId: string): Promise<Stripe> {
    const settings = await this.getRaw(organizationId);
    if (!settings.stripe_secret_key) {
      throw new BadRequestException(
        'Stripe no está configurado para esta organización. Ve a Configuración → Pagos.',
      );
    }
    return new Stripe(settings.stripe_secret_key);
  }
}
