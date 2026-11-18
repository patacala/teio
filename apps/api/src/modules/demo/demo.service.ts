import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Redis } from 'ioredis';
import { DemoType, DemoRequestStatus, MagicLinkType } from '@crm/shared';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { MailService } from '../../infrastructure/mail/mail.service';
import { emailFromTemplate } from '../../infrastructure/messaging';
import { demoTypeLabel } from '../platform-analytics/organization-insights';
import { ClientManagementService } from '../client-management/client-management.service';
import { CompaniesService } from '../client-management/companies.service';
import { MagicLinkEntity } from './magic-link.entity';
import { DemoRequestEntity } from './demo-request.entity';
import { SubmitDemoDto, DemoReadyDto, DemoRequestListParams } from './demo.dto';

function buildPaginationMeta(total: number, page: number, limit: number) {
  return { total, page, limit, total_pages: Math.ceil(total / limit) };
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(MagicLinkEntity)
    private readonly magicLinkRepo: Repository<MagicLinkEntity>,
    @InjectRepository(DemoRequestEntity)
    private readonly demoRequestRepo: Repository<DemoRequestEntity>,
    private readonly companiesService: CompaniesService,
    private readonly clientManagementService: ClientManagementService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Token helpers ────────────────────────────────────────────────────────────

  private generateRawToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async cacheToken(hash: string, data: object, ttlMs: number): Promise<void> {
    await this.redis.set(`demo_token:${hash}`, JSON.stringify(data), 'PX', ttlMs);
  }

  private async validateToken(raw: string, expectedType: MagicLinkType): Promise<MagicLinkEntity> {
    const hash = this.hashToken(raw);
    const now = new Date();

    // Try Redis cache first
    const cached = await this.redis.get(`demo_token:${hash}`);
    let link: MagicLinkEntity | null = null;

    if (cached) {
      // Cached — still verify from DB to get current uses_count
      link = await this.magicLinkRepo.findOne({ where: { token_hash: hash } });
    } else {
      link = await this.magicLinkRepo.findOne({ where: { token_hash: hash } });
    }

    if (!link) throw new NotFoundException('Invalid or expired demo link');
    if (link.type !== expectedType) throw new NotFoundException('Invalid or expired demo link');
    if (link.expires_at <= now) throw new NotFoundException('Invalid or expired demo link');
    if (link.revoked_at) throw new NotFoundException('Invalid or expired demo link');
    if (link.max_uses !== null && link.uses_count >= link.max_uses) {
      throw new NotFoundException('Invalid or expired demo link');
    }

    return link;
  }

  // ── Public methods ───────────────────────────────────────────────────────────

  async initDemo(ip: string): Promise<{ token: string }> {
    const rawToken = this.generateRawToken();
    const hash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000); // 45 min

    const link = this.magicLinkRepo.create({
      token_hash: hash,
      type: MagicLinkType.DEMO_INIT,
      organization_id: null,
      payload: {},
      expires_at: expiresAt,
      max_uses: 1,
      uses_count: 0,
      ip_address: ip,
    });
    await this.magicLinkRepo.save(link);
    await this.cacheToken(hash, { id: link.id, type: link.type }, 45 * 60 * 1000);

    return { token: rawToken };
  }

  async submitDemo(rawToken: string, dto: SubmitDemoDto): Promise<{ request_id: string }> {
    const link = await this.validateToken(rawToken, MagicLinkType.DEMO_INIT);
    const orgId = this.config.get<string>('demo.orgId', '');

    if (!orgId) {
      throw new Error('DEMO_ORG_ID is not configured');
    }

    const company = await this.companiesService.findOrCreate(orgId, {
      name: dto.company_name,
      website: dto.website,
    });

    const contact = await this.clientManagementService.create(orgId, {
      first_name: dto.first_name,
      last_name: dto.last_name,
      email: dto.email,
      phone: dto.phone,
      company_id: company.id,
      custom_fields: { source: 'demo_form', demo_type: dto.demo_type },
    });

    await this.magicLinkRepo.increment({ id: link.id }, 'uses_count', 1);

    const demoRequest = await this.demoRequestRepo.save(
      this.demoRequestRepo.create({
        contact_id: contact.id,
        company_id: company.id,
        organization_id: orgId,
        demo_type: dto.demo_type,
        status: DemoRequestStatus.PROCESSING,
        init_token_id: link.id,
      }),
    );

    // Fire-and-forget: the demo generator calls /webhooks/demo-ready when done.
    void this.requestDemoGeneration(contact.id, company.id, dto.website ?? '', dto.demo_type, demoRequest.id);

    return { request_id: demoRequest.id };
  }

  /**
   * Asks the demo generator (any service at DEMO_GENERATOR_URL) to build the
   * demo. The body is signed with DEMO_WEBHOOK_SECRET (`X-Signature:
   * sha256=<hex HMAC of the body>`) so the generator can check it came from
   * the CRM; it answers on `callback_url` with the same secret as token.
   */
  private async requestDemoGeneration(
    contactId: string,
    companyId: string,
    website: string,
    demoType: DemoType,
    requestId: string,
  ): Promise<void> {
    const generatorUrl = this.config.get<string>('demo.generatorUrl', '');
    if (!generatorUrl) {
      this.logger.warn('DEMO_GENERATOR_URL is not configured, the demo will not be generated');
      return;
    }

    const apiBaseUrl = this.config.get<string>('webhooks.baseUrl', 'http://localhost:3001');
    const body = JSON.stringify({
      contact_id: contactId,
      company_id: companyId,
      website,
      demo_type: demoType,
      request_id: requestId,
      callback_url: `${apiBaseUrl}/api/v1/webhooks/demo-ready`,
    });
    const secret = this.config.get<string>('demo.webhookSecret', '');

    try {
      await fetch(generatorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
          ...(secret ? { 'X-Signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } : {}),
        },
        body,
      });
    } catch (err) {
      this.logger.warn(`Demo generator request failed: ${(err as Error).message}`);
    }
  }

  async getDemoStatus(requestId: string): Promise<{ status: DemoRequestStatus; demo_url?: string }> {
    const req = await this.demoRequestRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Demo request not found');
    return { status: req.status, demo_url: req.demo_url ?? undefined };
  }

  private verifyDemoWebhookToken(token: string): void {
    const secret = this.config.get<string>('demo.webhookSecret', '');
    if (!secret) return;

    if (!token || token.length !== secret.length) {
      throw new UnauthorizedException('Invalid demo webhook token');
    }

    try {
      if (timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
        return;
      }
    } catch {
      // fall through
    }

    throw new UnauthorizedException('Invalid demo webhook token');
  }

  async handleDemoReady(dto: DemoReadyDto): Promise<void> {
    this.verifyDemoWebhookToken(dto.webhook_token);

    const orgId = this.config.get<string>('demo.orgId', '');

    const demoRequest = await this.demoRequestRepo.findOne({
      where: { id: dto.request_id, status: DemoRequestStatus.PROCESSING },
    });

    if (!demoRequest) {
      this.logger.warn(`No processing demo request found for request ${dto.request_id}`);
      return;
    }

    if (dto.status === DemoRequestStatus.FAILED) {
      await this.demoRequestRepo.update(demoRequest.id, {
        status: DemoRequestStatus.FAILED,
        error_message: dto.error_message ?? 'Processing failed',
      });
      return;
    }

    // Generate Link 2 (experience token)
    const rawExp = this.generateRawToken();
    const expHash = this.hashToken(rawExp);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const expLink = await this.magicLinkRepo.save(
      this.magicLinkRepo.create({
        token_hash: expHash,
        type: MagicLinkType.DEMO_EXPERIENCE,
        organization_id: orgId || null,
        payload: { contact_id: demoRequest.contact_id, demo_type: demoRequest.demo_type },
        expires_at: expiresAt,
        max_uses: 50,
        uses_count: 0,
      }),
    );

    const landingUrl = this.config.get<string>('demo.landingUrl', '');
    const demoUrl = `${landingUrl}/demo/experience/${rawExp}`;

    await this.demoRequestRepo.update(demoRequest.id, {
      status: DemoRequestStatus.READY,
      experience_token_id: expLink.id,
      demo_url: demoUrl,
    });

    await this.cacheToken(expHash, { id: expLink.id, type: expLink.type }, 7 * 24 * 60 * 60 * 1000);

    // Send email (fire-and-forget)
    if (orgId) {
      void this.sendDemoReadyEmail(demoRequest.contact_id!, orgId, demoUrl, demoRequest.demo_type);
    }
  }

  private async sendDemoReadyEmail(
    contactId: string,
    orgId: string,
    demoUrl: string,
    demoType: DemoType,
    toEmail?: string,
  ): Promise<void> {
    try {
      const contact = await this.clientManagementService.findById(contactId, orgId);
      const recipientEmail = toEmail || contact?.email;
      if (!recipientEmail) return;

      const templateId = this.config.get<string>('mail.demoTemplateId', '');

      if (templateId) {
        await this.mailService.send({
          to: recipientEmail,
          templateId,
          variables: {
            firstName: contact?.first_name ?? '',
            demoType,
            demoUrl,
            companyName: contact?.company?.name ?? '',
          },
        });
      } else {
        // first_name comes from the public demo form: the layout escapes every value.
        await this.mailService.send({
          to: recipientEmail,
          ...emailFromTemplate('demo_ready', {
            user_name: contact?.first_name,
            demo_type: demoTypeLabel(demoType),
            demo_url: demoUrl,
          }),
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to send demo-ready email: ${(err as Error).message}`);
    }
  }

  async validateDemoExperience(rawToken: string): Promise<{ demo_type: DemoType; contact_id: string }> {
    const link = await this.validateToken(rawToken, MagicLinkType.DEMO_EXPERIENCE);
    await this.magicLinkRepo.increment({ id: link.id }, 'uses_count', 1);
    const payload = link.payload as { demo_type: DemoType; contact_id: string };
    return { demo_type: payload.demo_type, contact_id: payload.contact_id };
  }

  // ── Admin methods ────────────────────────────────────────────────────────────

  async resendDemoEmail(requestId: string, orgId: string, overrideEmail?: string): Promise<void> {
    const demoRequest = await this.demoRequestRepo.findOne({
      where: { id: requestId, organization_id: orgId },
    });

    if (!demoRequest) throw new NotFoundException('Demo request not found');
    if (demoRequest.status !== DemoRequestStatus.READY || !demoRequest.demo_url) {
      throw new BadRequestException('Demo is not ready or has no URL');
    }

    await this.sendDemoReadyEmail(
      demoRequest.contact_id!,
      orgId,
      demoRequest.demo_url,
      demoRequest.demo_type,
      overrideEmail,
    );
  }

  async findDemoRequests(
    orgId: string,
    params: DemoRequestListParams,
  ): Promise<{
    items: (DemoRequestEntity & { contact_name: string | null; contact_email: string | null })[];
    meta: ReturnType<typeof buildPaginationMeta>;
  }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.demoRequestRepo.query(
        `SELECT dr.*, c.first_name AS contact_name, c.email AS contact_email
         FROM clients.demo_requests dr
         LEFT JOIN clients.contacts c ON c.id = dr.contact_id
         WHERE dr.organization_id = $1
         ORDER BY dr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [orgId, limit, skip],
      ),
      this.demoRequestRepo.count({ where: { organization_id: orgId } }),
    ]);

    return { items: rows, meta: buildPaginationMeta(total, page, limit) };
  }

  async revokeDemoLink(linkId: string, _orgId: string): Promise<void> {
    const link = await this.magicLinkRepo.findOne({ where: { id: linkId } });
    if (!link) throw new NotFoundException('Magic link not found');

    await this.magicLinkRepo.update(linkId, { revoked_at: new Date() });
    await this.redis.del(`demo_token:${link.token_hash}`);
  }
}
