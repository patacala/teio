import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AppointmentEntity } from './appointment.entity';
import { signConfirmationToken, verifyConfirmationToken } from './domain/confirmation-token';

export type ConfirmationChannel = 'email' | 'sms';

/** Builds and checks the public "confirm your appointment" links. */
@Injectable()
export class BookingLinksService {
  private readonly logger = new Logger(BookingLinksService.name);
  private readonly secret: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('scheduling.linkSecret', '');
    if (!configured || configured.length < 16 || configured === 'change-me') {
      this.logger.warn(
        'BOOKING_LINK_SECRET (or JWT_SECRET) is missing or weak — confirmation links use a per-process key and stop working after a restart',
      );
      this.secret = randomBytes(32).toString('hex');
    } else {
      this.secret = configured;
    }
    this.baseUrl = config.get<string>('webhooks.baseUrl', 'http://localhost:3001');
  }

  confirmUrl(appt: Pick<AppointmentEntity, 'id' | 'confirmation_version' | 'starts_at'>, channel: ConfirmationChannel): string {
    const token = signConfirmationToken(this.secret, {
      appointmentId: appt.id,
      version: appt.confirmation_version ?? 1,
      expiresAt: appt.starts_at,
    });
    const via = channel === 'sms' ? '&c=s' : '';
    return `${this.baseUrl}/api/v1/public/appointments/confirm?token=${encodeURIComponent(token)}${via}`;
  }

  /**
   * The contact's link for this booking, for email and for SMS. One page does
   * everything: confirm, choose another time, cancel.
   */
  pair(appt: Pick<AppointmentEntity, 'id' | 'confirmation_version' | 'starts_at'>): { email: string; sms: string } {
    return { email: this.confirmUrl(appt, 'email'), sms: this.confirmUrl(appt, 'sms') };
  }

  verify(token: string, now = new Date()) {
    return verifyConfirmationToken(this.secret, token, now);
  }
}
