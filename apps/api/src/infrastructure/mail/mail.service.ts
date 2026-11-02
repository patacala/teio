import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailAttachment {
  filename: string;
  content: string; // base64-encoded
  contentType?: string;
}

export interface SendMailHtmlOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: MailAttachment[];
}

export interface SendMailTemplateOptions {
  to: string;
  from?: string;
  subject?: string;
  templateId: string;
  variables?: Record<string, string>;
  attachments?: MailAttachment[];
}

export type SendMailOptions = SendMailHtmlOptions | SendMailTemplateOptions;

function isTemplateOptions(opts: SendMailOptions): opts is SendMailTemplateOptions {
  return 'templateId' in opts;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(opts: SendMailOptions): Promise<void> {
    const provider = this.config.get<string>('mail.provider', 'ses');
    const from = opts.from ?? this.config.get<string>('mail.from', 'noreply@example.com');

    try {
      if (provider === 'ses') return await this.sendViaSes({ ...opts, from });
      if (provider === 'resend') return await this.sendViaResend({ ...opts, from });
      return await this.sendViaSendgrid({ ...opts, from });
    } catch (err) {
      this.logger.error(`Failed to send email via ${provider}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async sendViaSes(opts: SendMailOptions & { from: string }): Promise<void> {
    if (isTemplateOptions(opts)) {
      throw new BadRequestException('SES templates are not supported. Use html mode or switch to Resend/SendGrid.');
    }

    const { SESClient, SendEmailCommand, SendRawEmailCommand } = await import('@aws-sdk/client-ses');
    const client = new SESClient({
      region: this.config.get<string>('aws.sesRegion', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('aws.accessKeyId', ''),
        secretAccessKey: this.config.get<string>('aws.secretAccessKey', ''),
      },
    });

    if (opts.attachments?.length) {
      const boundary = `----=_Part_${Date.now()}`;
      const rawParts = [
        `From: ${opts.from}`,
        `To: ${opts.to}`,
        `Subject: ${opts.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: 7bit`,
        '',
        opts.html,
      ];

      for (const att of opts.attachments) {
        rawParts.push(
          `--${boundary}`,
          `Content-Type: ${att.contentType ?? 'application/octet-stream'}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          att.content,
        );
      }
      rawParts.push(`--${boundary}--`);

      await client.send(
        new SendRawEmailCommand({
          RawMessage: { Data: Buffer.from(rawParts.join('\r\n')) },
        }),
      );
    } else {
      await client.send(
        new SendEmailCommand({
          Source: opts.from,
          Destination: { ToAddresses: [opts.to] },
          Message: {
            Subject: { Data: opts.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: opts.html, Charset: 'UTF-8' } },
          },
        }),
      );
    }
  }

  private async sendViaResend(opts: SendMailOptions & { from: string }): Promise<void> {
    const apiKey = this.config.get<string>('mail.resendApiKey', '');

    const payload: Record<string, unknown> = {
      from: opts.from,
      to: [opts.to],
    };

    if (isTemplateOptions(opts)) {
      const tpl: Record<string, unknown> = { id: opts.templateId };
      if (opts.variables) tpl.variables = opts.variables;
      payload.template = tpl;
      if (opts.subject) payload.subject = opts.subject;
    } else {
      payload.subject = opts.subject;
      payload.html = opts.html;
    }

    if (opts.attachments?.length) {
      payload.attachments = opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType ?? 'application/octet-stream',
      }));
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new InternalServerErrorException(`Resend error ${res.status}: ${body}`);
    }
  }

  private async sendViaSendgrid(opts: SendMailOptions & { from: string }): Promise<void> {
    const apiKey = this.config.get<string>('mail.sendgridApiKey', '');

    const payload: Record<string, unknown> = {
      from: { email: opts.from },
    };

    if (isTemplateOptions(opts)) {
      payload.template_id = opts.templateId;
      payload.personalizations = [{
        to: [{ email: opts.to }],
        dynamic_template_data: opts.variables ?? {},
      }];
    } else {
      payload.subject = opts.subject;
      payload.personalizations = [{ to: [{ email: opts.to }] }];
      payload.content = [{ type: 'text/html', value: opts.html }];
    }

    if (opts.attachments?.length) {
      payload.attachments = opts.attachments.map((a) => ({
        content: a.content,
        filename: a.filename,
        type: a.contentType ?? 'application/octet-stream',
        disposition: 'attachment',
      }));
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new InternalServerErrorException(`Sendgrid error ${res.status}: ${body}`);
    }
  }
}
