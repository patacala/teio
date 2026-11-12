import { AppointmentEmailConsumer } from './appointment-email.consumer';

function build(contact: Record<string, unknown> | null, dispatched = false) {
  const mail = { send: jest.fn(async () => undefined) };
  const sms = { send: jest.fn(async () => ({ providerId: 'x' })) };
  const dispatch = { dispatch: jest.fn(async () => ({ dispatched })) };
  const seen = new Set<string>();
  const processed = {
    claim: jest.fn(async (consumer: string, eventId: unknown) => {
      if (typeof eventId !== 'string') return true;
      const key = `${consumer}:${eventId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
  const consumer = new AppointmentEmailConsumer(
    mail as never,
    dispatch as never,
    { findOne: async () => contact } as never,
    { findOne: async () => ({ name: 'Clínica Sol' }) } as never,
    { findOne: async () => null } as never,
    sms as never,
    processed as never,
  );
  return { consumer, mail, sms, dispatch };
}

const attachment = (mail: { send: jest.Mock }) => {
  const sent = (mail.send.mock.calls[0] as unknown[])[0] as { attachments: Array<{ content: string; contentType: string }> };
  return { ...sent.attachments[0], text: Buffer.from(sent.attachments[0].content, 'base64').toString('utf8') };
};

const request = {
  organization_id: 'org',
  appointment_id: 'a1',
  contact_id: 'c1',
  title: 'Consulta',
  starts_at: '2026-03-23T15:00:00.000Z',
  ends_at: '2026-03-23T15:30:00.000Z',
  timezone: 'America/Mexico_City',
  origin: 'human',
  action: null,
  confirm_url: 'https://api.test/confirm?token=e',
  confirm_url_sms: 'https://api.test/confirm?token=e&c=s',
};

describe('AppointmentEmailConsumer confirmation requests', () => {
  it('emails a confirm button (inline fallback when the org has no template)', async () => {
    const { consumer, mail, sms } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await consumer.handleConfirmationRequested(request);
    expect(mail.send).toHaveBeenCalledTimes(1);
    const sent = (mail.send.mock.calls[0] as unknown[])[0] as { subject: string; html: string };
    expect(sent.subject).toBe('Confirma tu cita: Consulta');
    expect(sent.html).toContain('href="https://api.test/confirm?token=e"');
    expect(sent.html).toContain('09:00');
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('sends the SMS link when the contact has no email', async () => {
    const { consumer, mail, sms } = build({ email: null, phone: '+52155', first_name: 'Ana' });
    await consumer.handleConfirmationRequested(request);
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: '+52155', text: expect.stringContaining('&c=s') }));
  });

  it('uses the org templates when they exist', async () => {
    const { consumer, mail, dispatch } = build({ email: 'ana@x.com', phone: '+52155', first_name: 'Ana' }, true);
    await consumer.handleConfirmationRequested({ ...request, rescheduled: true });
    expect(mail.send).not.toHaveBeenCalled();
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment_confirmation_request', channelType: 'email', variables: expect.objectContaining({ confirm_url: request.confirm_url, rescheduled: 'true' }) }),
    );
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: 'sms', variables: expect.objectContaining({ confirm_url: request.confirm_url_sms }) }),
    );
  });

  it('never messages the contact about follow-up steps', async () => {
    const { consumer, mail, sms, dispatch } = build({ email: 'ana@x.com', phone: '+52155' });
    const step = { ...request, origin: 'automation', action: 'send_message' };
    await consumer.handleConfirmationRequested(step);
    await consumer.handleAppointmentCancelled(step);
    await consumer.handleAppointmentRescheduled(step);
    await consumer.handleAppointmentConfirmed(step);
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('handles a redelivered event only once', async () => {
    const { consumer, mail } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    const event = { ...request, event_id: '11111111-1111-4111-8111-111111111111' };
    await consumer.handleConfirmationRequested(event);
    await consumer.handleConfirmationRequested(event);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
});

describe('AppointmentEmailConsumer calendar invites and reminders', () => {
  const booking = {
    organization_id: 'org',
    appointment_id: 'a1',
    contact_id: 'c1',
    title: 'Consulta',
    starts_at: '2026-03-23T15:00:00.000Z',
    ends_at: '2026-03-23T15:30:00.000Z',
    timezone: 'America/Mexico_City',
    origin: 'human',
    status: 'confirmed',
    sequence: 3,
    manage_url: 'https://api.test/manage?token=m',
  };

  it('confirms with an invite (UTC times, sequence) and a link to change or cancel', async () => {
    const { consumer, mail } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await consumer.handleAppointmentConfirmed(booking);
    const ics = attachment(mail);
    expect(ics.contentType).toBe('text/calendar; method=REQUEST');
    expect(ics.text).toContain('DTSTART:20260323T150000Z');
    expect(ics.text).toContain('SEQUENCE:3');
    expect(ics.text).toContain('UID:a1@crm');
    const html = ((mail.send.mock.calls[0] as unknown[])[0] as { html: string }).html;
    expect(html).toContain('https://api.test/manage?token=m');
  });

  it('cancels the invite in the contact calendar', async () => {
    const { consumer, mail } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await consumer.handleAppointmentCancelled({ ...booking, status: 'cancelled', sequence: 4 });
    const ics = attachment(mail);
    expect(ics.contentType).toBe('text/calendar; method=CANCEL');
    expect(ics.text).toContain('STATUS:CANCELLED');
    expect(ics.text).toContain('SEQUENCE:4');
  });

  it('reminds confirmed bookings and asks unconfirmed ones to confirm', async () => {
    const confirmed = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await confirmed.consumer.handleReminderDue({ ...booking, reminder_id: 'r1', offset_minutes: 1440 });
    expect(confirmed.dispatch.dispatch).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'appointment_reminder' }));
    expect(((confirmed.mail.send.mock.calls[0] as unknown[])[0] as { subject: string }).subject).toBe('Recordatorio: Consulta');

    const unconfirmed = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await unconfirmed.consumer.handleReminderDue({
      ...booking,
      status: 'scheduled',
      reminder_id: 'r2',
      offset_minutes: 1440,
      confirm_url: 'https://api.test/confirm?token=c',
      confirm_url_sms: 'https://api.test/confirm?token=c&c=s',
    });
    const sent = (unconfirmed.mail.send.mock.calls[0] as unknown[])[0] as { subject: string; html: string };
    expect(sent.subject).toBe('Recordatorio: confirma tu cita Consulta');
    expect(sent.html).toContain('https://api.test/confirm?token=c');
  });
});
