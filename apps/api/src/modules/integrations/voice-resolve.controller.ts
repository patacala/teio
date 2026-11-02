import { timingSafeEqual } from 'crypto';
import {
  Controller, Get, Query, Headers, UnauthorizedException, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { ChannelsService } from './channels.service';
import { OrganizationsService } from '../organizations/organizations.service';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

@Controller({ path: 'integrations/voice', version: '1' })
export class VoiceResolveController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly orgs: OrganizationsService,
    private readonly config: ConfigService,
  ) {}

  // Inbound voice: ProSales asks which org owns the dialed Retell number so it
  // can run the conversation. ProSales keeps no number->org mapping and no
  // Retell credential — the CRM is the source of truth.
  // @Public skips the JWT guard. This route authenticates with x-internal-token.
  @Public()
  @Get('resolve')
  async resolve(
    @Query('number') number: string,
    @Headers('x-internal-token') token?: string,
    @Query('agent') agent?: string,
  ): Promise<{ organization_id: string; agent_version_id: string }> {
    const expected = this.config.get<string>('prosales.internalToken') ?? '';
    if (!expected || !token || !safeEqual(token, expected)) {
      throw new UnauthorizedException('invalid internal token');
    }
    // Robust match: tolerates phone-format variants and the inbound-number /
    // outbound-agent shapes a voice channel can carry.
    const channel = await this.channels.findVoiceChannel({ number, agentId: agent });
    if (!channel) {
      throw new NotFoundException('no active voice channel for that number');
    }
    const integration = await this.orgs.getProsalesIntegration(channel.organization_id);
    if (!integration.agent_version_id) {
      throw new NotFoundException('organization has no ProSales agent configured');
    }
    return {
      organization_id: channel.organization_id,
      agent_version_id: integration.agent_version_id,
    };
  }
}
