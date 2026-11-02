import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { MailService } from '../../infrastructure/mail/mail.service';
import { SendMailWithHtmlDto, SendMailWithTemplateDto } from './mail.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('mail')
@ApiSecurity('x-api-key')
@Controller({ path: 'mail', version: '1' })
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ 
    summary: 'Send email via HTML or template',
    description: 'Send an email using either raw HTML content or a template ID. Requires API key authentication via x-api-key header.'
  })
  @ApiResponse({ 
    status: HttpStatus.ACCEPTED, 
    description: 'Email queued for sending' 
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid request payload' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Invalid or missing API key' 
  })
  async sendMail(
    @Body() dto: SendMailWithHtmlDto | SendMailWithTemplateDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    // Validate that we have either HTML or templateId
    const hasHtml = 'html' in dto && 'subject' in dto;
    const hasTemplate = 'templateId' in dto;

    if (!hasHtml && !hasTemplate) {
      throw new BadRequestException(
        'Either provide { to, subject, html } for HTML emails or { to, templateId } for template emails',
      );
    }

    if (hasHtml && hasTemplate) {
      throw new BadRequestException(
        'Cannot send both HTML and template in the same request. Choose one method.',
      );
    }

    try {
      await this.mailService.send(dto);

      return {
        success: true,
        message: 'Email queued for delivery',
        organizationId: tenant.organization_id,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to send email: ${(error as Error).message}`,
      );
    }
  }
}
