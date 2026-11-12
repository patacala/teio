import { FunnelAutomationConsumer } from './funnel-automation.consumer';

describe('FunnelAutomationConsumer appointment events', () => {
  const rules = { evaluate: jest.fn(async () => undefined) };
  const consumer = new FunnelAutomationConsumer(rules as never);
  const booking = { organization_id: 'org', contact_id: 'c', origin: 'human', action: null };

  beforeEach(() => rules.evaluate.mockClear());

  it('moves the funnel for real bookings, including API-key bookings', async () => {
    await consumer.onAppointmentCreated(booking);
    await consumer.onAppointmentConfirmed({ ...booking, origin: 'ai' });
    await consumer.onAppointmentCompleted({ ...booking, origin: 'webhook' });
    await consumer.onAppointmentNoShow(booking);
    expect(rules.evaluate.mock.calls.map((c) => (c as unknown[])[2])).toEqual([
      'appointment.created',
      'appointment.confirmed',
      'appointment.completed',
      'appointment.no_show',
    ]);
  });

  it('ignores follow-up steps on every appointment event', async () => {
    const step = { ...booking, origin: 'automation', action: 'send_message' };
    await consumer.onAppointmentCreated(step);
    await consumer.onAppointmentConfirmed(step);
    await consumer.onAppointmentCompleted(step);
    await consumer.onAppointmentCompleted({ ...booking, action: 'send_message' });
    await consumer.onAppointmentNoShow(step);
    expect(rules.evaluate).not.toHaveBeenCalled();
  });
});
