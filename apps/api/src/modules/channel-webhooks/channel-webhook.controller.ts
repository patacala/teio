import {
  Controller, Get, Post, Param, Query, Body, Headers, Req, Res,
  HttpCode, HttpStatus, NotFoundException, Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookHandlerRegistry } from './webhook-handler.registry';
import { ConversationManagementService } from '../conversation-management/conversation-management.service';

@Controller({ path: 'webhooks/channel', version: '1' })
export class ChannelWebhookController {
  private readonly logger = new Logger(ChannelWebhookController.name);

  constructor(
    private readonly registry: WebhookHandlerRegistry,
    private readonly conversationService: ConversationManagementService,
  ) {}

  /**
   * GET /api/v1/webhooks/channel/:channelType
   * Platform verification challenge (Facebook hub.challenge, etc.)
   * Uses @Res() to bypass NestJS interceptor and send raw plain text.
   */
  @Public()
  @Get(':channelType')
  async verify(
    @Param('channelType') channelType: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const handler = this.registry.get(channelType);
    if (!handler?.handleVerification) {
      res.status(HttpStatus.NOT_FOUND).json({ message: `No verification handler for channel type '${channelType}'` });
      return;
    }
    const challenge = await handler.handleVerification(query);
    res.setHeader('Content-Type', 'text/plain');
    res.status(HttpStatus.OK).send(challenge);
  }

  /**
   * POST /api/v1/webhooks/channel/:channelType
   * Incoming messages from any platform.
   * Handler is responsible for signature validation + payload normalization.
   */
  @Public()
  @Post(':channelType')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('channelType') channelType: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ status: string }> {
    this.logger.log(`Webhook POST received: channelType=${channelType} body=${JSON.stringify(body)}`);

    const handler = this.registry.get(channelType);
    if (!handler) {
      throw new NotFoundException(`Channel type '${channelType}' is not supported`);
    }

    const dtos = await handler.handle(body, headers, req.rawBody);

    for (const dto of dtos) {
      try {
        await this.conversationService.ingestMessage(dto);
      } catch (err) {
        this.logger.error(
          `Failed to ingest message for channel=${channelType}: ${(err as Error).message}`,
        );
      }
    }

    return { status: 'ok' };
  }
}
