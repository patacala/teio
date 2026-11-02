import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';
import { DemoService } from './demo.service';
import { SubmitDemoDto, DemoRequestListParams, SendDemoEmailDto } from './demo.dto';

@Controller({ path: 'demo', version: '1' })
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // ── Admin routes (auth via global guards) ────────────────────────────────────

  @Get('requests')
  findDemoRequests(
    @CurrentTenant() tenant: TenantContext,
    @Query() params: DemoRequestListParams,
  ) {
    return this.demoService.findDemoRequests(tenant.organization_id, params);
  }

  @Post('requests/:id/send-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendDemoEmail(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendDemoEmailDto,
  ) {
    return this.demoService.resendDemoEmail(id, tenant.organization_id, dto.email);
  }

  @Patch('links/:linkId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeDemoLink(
    @Param('linkId') linkId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.demoService.revokeDemoLink(linkId, tenant.organization_id);
  }

  // ── Public routes ────────────────────────────────────────────────────────────

  @Public()
  @Post('init')
  @Throttle({ default: { limit: 3, ttl: 3600_000 } })
  initDemo(@Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
    return this.demoService.initDemo(ip);
  }

  @Public()
  @Post(':token/submit')
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  submitDemo(@Param('token') token: string, @Body() dto: SubmitDemoDto) {
    return this.demoService.submitDemo(token, dto);
  }

  @Public()
  @Get('status/:requestId')
  getDemoStatus(@Param('requestId') requestId: string) {
    return this.demoService.getDemoStatus(requestId);
  }

  @Public()
  @Get('experience/:token')
  validateDemoExperience(@Param('token') token: string) {
    return this.demoService.validateDemoExperience(token);
  }
}
