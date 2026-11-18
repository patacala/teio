import { FunnelAutomationConsumer } from './funnel-automation.consumer';

describe('FunnelAutomationConsumer appointment events', () => {
  const rules = { evaluate: jest.fn(async () => undefined) };
  const consumer = new FunnelAutomationConsumer(rules as never);
  const booking = { organization_id: 'org', contact_id: 'c' };

  beforeEach(() => rules.evaluate.mockClear());

  it('moves the funnel on every booking event', async () => {
    await consumer.onAppointmentCreated(booking);
    await consumer.onAppointmentConfirmed(booking);
    await consumer.onAppointmentCompleted(booking);
    await consumer.onAppointmentNoShow(booking);
    expect(rules.evaluate.mock.calls.map((c) => (c as unknown[])[2])).toEqual([
      'appointment.created',
      'appointment.confirmed',
      'appointment.completed',
      'appointment.no_show',
    ]);
  });
});
