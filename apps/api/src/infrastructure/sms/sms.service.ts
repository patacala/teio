import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendSmsOptions {
  to: string;
  text: string;
  from?: string;
  apiKey?: string;
  messagingProfileId?: string;
}

export interface SendSmsResult {
  providerId: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(opts: SendSmsOptions): Promise<SendSmsResult> {
    const apiKey = opts.apiKey || this.config.get<string>('sms.telnyxApiKey');
    const from = opts.from || this.config.get<string>('sms.from');
    const messagingProfileId = opts.messagingProfileId || this.config.get<string>('sms.messagingProfileId');

    if (!apiKey) {
      throw new Error('SMS: No Telnyx API key configured');
    }
    if (!from) {
      throw new Error('SMS: No from number configured');
    }

    if (!opts.text?.trim()) {
      throw new Error('SMS: Message text is empty');
    }

    const to = this.normalizeE164(opts.to);
    this.validateE164(to);

    return this.sendViaTelnyx(to, opts.text, from, apiKey, messagingProfileId);
  }

  private normalizeE164(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    if (phone.startsWith('+')) return phone.replace(/[^\d+]/g, '');
    // 10-digit US/CA numbers → prepend +1
    if (digits.length === 10) return `+1${digits}`;
    return `+${digits}`;
  }

  private validateE164(phone: string): void {
    // E.164: + followed by 10-15 digits
    if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
      throw new Error(`SMS: Invalid phone number "${phone}" — must be E.164 format (e.g. +1XXXXXXXXXX)`);
    }
  }

  private async sendViaTelnyx(
    to: string,
    text: string,
    from: string,
    apiKey: string,
    messagingProfileId?: string,
  ): Promise<SendSmsResult> {
    const payload: Record<string, string> = { from, to, text };
    if (messagingProfileId) {
      payload.messaging_profile_id = messagingProfileId;
    }

    const res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Telnyx API ${res.status}: ${body}`);
      throw new Error(`Telnyx API returned ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { data?: { id?: string } };
    const providerId = data?.data?.id ?? '';

    this.logger.log(`SMS sent to ${to} via Telnyx (id=${providerId})`);
    return { providerId };
  }
}
