import { BadRequestException } from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentsService } from './payments.service';

describe('payments: English messages', () => {
  it('tells admins to connect Stripe when it is not configured', async () => {
    const repo = { findOne: async () => ({ organization_id: 'org', stripe_secret_key: null }) };
    const settings = new PaymentSettingsService(repo as never, {} as never);
    await expect(settings.getStripeClient('org')).rejects.toThrow(
      new BadRequestException('Stripe is not configured for this organization. Go to Settings → Payments.'),
    );
  });

  describe('payment result handed to the AI agent and webhooks', () => {
    const message = (args: Record<string, unknown>) =>
      (new PaymentsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never) as unknown as {
        buildPaymentCompletedMessage: (a: Record<string, unknown>) => string;
      }).buildPaymentCompletedMessage({
        serviceName: 'Checkup',
        amount: 5000,
        currency: 'usd',
        appointmentConfirmed: false,
        needsAttention: false,
        booking: null,
        appointmentId: null,
        ...args,
      });

    it('appointment confirmed', () => {
      expect(
        message({ appointmentConfirmed: true, booking: { title: 'Checkup', starts_at: '2026-03-23T15:00:00Z' }, appointmentId: 'a1' }),
      ).toBe('Payment confirmed (Checkup) (50.00 USD). Appointment confirmed: "Checkup" on 2026-03-23T15:00:00Z (appointment_id=a1).');
    });

    it('slot no longer available', () => {
      expect(message({ needsAttention: true })).toBe(
        'Payment confirmed (Checkup) (50.00 USD), but that time slot was no longer available. ' +
          'The team will review the case and contact the customer to reschedule; do not promise a new time or a refund.',
      );
    });

    it('link without a time slot', () => {
      expect(message({})).toBe(
        'Payment confirmed (Checkup) (50.00 USD). No appointment was created: the link did not include a time slot.',
      );
    });
  });
});
