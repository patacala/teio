import { AppointmentEmailConsumer } from './appointment-email.consumer';

function build(contact: Record<string, unknown> | null) {
  const mail = { send: jest.fn(async () => undefined) };
  const sms = { send: jest.fn(async () => ({ providerId: 'x' })) };
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
    { findOne: async () => contact } as never,
    { findOne: async () => ({ name: 'Clínica Sol' }) } as never,
    { findOne: async () => null } as never,
    sms as never,
    processed as never,
  );
  return { consumer, mail, sms };
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
  it('emails a confirm button', async () => {
    const { consumer, mail, sms } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await consumer.handleConfirmationRequested(request);
    expect(mail.send).toHaveBeenCalledTimes(1);
    const sent = (mail.send.mock.calls[0] as unknown[])[0] as { subject: string; html: string };
    expect(sent.subject).toBe('Please confirm your appointment: Consulta');
    expect(sent.html).toContain('Hi Ana,');
    expect(sent.html).toContain('Monday, March 23, 2026');
    expect(sent.html).toContain('href="https://api.test/confirm?token=e"');
    expect(sent.html).toContain('09:00');
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('sends the SMS link (English) when the contact has no email', async () => {
    const { consumer, mail, sms } = build({ email: null, phone: '+52155', first_name: 'Ana' });
    await consumer.handleConfirmationRequested(request);
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledWith({
      to: '+52155',
      text: 'Clínica Sol: Hi Ana, please confirm your appointment "Consulta" on Monday, March 23, 2026 at 09:00 AM: https://api.test/confirm?token=e&c=s',
    });
  });

  it('asks to confirm the new time by email only when the contact has both email and phone', async () => {
    const { consumer, mail, sms } = build({ email: 'ana@x.com', phone: '+52155', first_name: 'Ana' });
    await consumer.handleConfirmationRequested({ ...request, rescheduled: true });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(((mail.send.mock.calls[0] as unknown[])[0] as { subject: string }).subject).toBe('Please confirm the new time: Consulta');
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('never messages the contact about follow-up steps', async () => {
    const { consumer, mail, sms } = build({ email: 'ana@x.com', phone: '+52155' });
    const step = { ...request, origin: 'automation', action: 'send_message' };
    await consumer.handleConfirmationRequested(step);
    await consumer.handleAppointmentCancelled(step);
    await consumer.handleAppointmentRescheduled(step);
    await consumer.handleAppointmentConfirmed(step);
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
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
    expect(((confirmed.mail.send.mock.calls[0] as unknown[])[0] as { subject: string }).subject).toBe('Reminder: Consulta');

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
    expect(sent.subject).toBe('Reminder: please confirm your appointment Consulta');
    expect(sent.html).toContain('https://api.test/confirm?token=c');
  });
});

describe('AppointmentEmailConsumer SMS texts', () => {
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
    sequence: 2,
    manage_url: 'https://api.test/manage?token=m',
    manage_url_sms: 'https://api.test/m/abc',
  };
  const both = { email: 'ana@x.com', phone: '+52155', first_name: 'Ana' };
  const smsText = (sms: { send: jest.Mock }) => ((sms.send.mock.calls[0] as unknown[])[0] as { to: string; text: string });

  it('texts the confirmation with the manage link, alongside the email', async () => {
    const { consumer, mail, sms } = build(both);
    await consumer.handleAppointmentConfirmed(booking);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(smsText(sms).to).toBe('+52155');
    expect(smsText(sms).text).toBe(
      'Clínica Sol: Hi Ana, your appointment "Consulta" is confirmed for Monday, March 23, 2026 at 09:00 AM. Reschedule or cancel: https://api.test/m/abc',
    );
  });

  it('texts a reschedule with the new time', async () => {
    const { consumer, mail, sms } = build(both);
    await consumer.handleAppointmentRescheduled({ ...booking, sequence: 3 });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(smsText(sms).text).toBe(
      'Clínica Sol: Hi Ana, your appointment "Consulta" has been moved to Monday, March 23, 2026 at 09:00 AM. Reschedule or cancel: https://api.test/m/abc',
    );
  });

  it('sends nothing for a reschedule still awaiting confirmation (the confirmation request covers it)', async () => {
    const { consumer, mail, sms } = build(both);
    await consumer.handleAppointmentRescheduled({ ...booking, status: 'scheduled' });
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('texts a cancellation without a manage link', async () => {
    const { consumer, sms } = build(both);
    await consumer.handleAppointmentCancelled({ ...booking, status: 'cancelled' });
    expect(smsText(sms).text).toBe('Clínica Sol: Hi Ana, your appointment "Consulta" on Monday, March 23, 2026 at 09:00 AM has been cancelled.');
  });

  it('texts only contacts without an email for reminders', async () => {
    const withEmail = build(both);
    await withEmail.consumer.handleReminderDue({ ...booking, reminder_id: 'r1', offset_minutes: 60 });
    expect(withEmail.sms.send).not.toHaveBeenCalled();

    const phoneOnly = build({ email: null, phone: '+52155', first_name: 'Ana' });
    await phoneOnly.consumer.handleReminderDue({ ...booking, reminder_id: 'r2', offset_minutes: 60 });
    expect(phoneOnly.mail.send).not.toHaveBeenCalled();
    expect(smsText(phoneOnly.sms).text).toBe(
      'Clínica Sol: Hi Ana, this is a reminder of your appointment "Consulta" on Monday, March 23, 2026 at 09:00 AM.',
    );
  });
});

describe('AppointmentEmailConsumer email content', () => {
  const booking = {
    organization_id: 'org',
    appointment_id: 'a1',
    contact_id: 'c1',
    title: 'Consulta <b>VIP</b>',
    starts_at: '2026-03-23T15:00:00.000Z',
    ends_at: '2026-03-23T15:30:00.000Z',
    timezone: 'America/Mexico_City',
    location: 'Main office',
    meeting_url: 'https://meet.test/abc',
    origin: 'human',
    status: 'confirmed',
    sequence: 1,
    manage_url: 'https://api.test/manage?token=m',
  };
  const sentEmail = (mail: { send: jest.Mock }) =>
    (mail.send.mock.calls[0] as unknown[])[0] as { subject: string; html: string };

  it('confirms in English with {{user_name}}, the appointment details and escaped values', async () => {
    const { consumer, mail } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana', last_name: 'García' });
    await consumer.handleAppointmentConfirmed(booking);
    const { subject, html } = sentEmail(mail);
    expect(subject).toBe('Appointment confirmed: Consulta <b>VIP</b>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Hi Ana García,');
    expect(html).toContain('<strong>Consulta &lt;b&gt;VIP&lt;/b&gt;</strong>');
    expect(html).toContain('Monday, March 23, 2026');
    expect(html).toContain('09:00 AM – 09:30 AM (America/Mexico_City)');
    expect(html).toContain('Main office');
    expect(html).toContain('href="https://meet.test/abc"');
    expect(html).toContain('>Reschedule or cancel</a>');
  });

  it('hides the location row, meeting button and manage link when the booking has none', async () => {
    const { consumer, mail } = build({ email: 'ana@x.com', phone: null, first_name: 'Ana' });
    await consumer.handleAppointmentConfirmed({ ...booking, location: undefined, meeting_url: undefined, manage_url: null });
    const { html } = sentEmail(mail);
    expect(html).not.toContain('>Location<');
    expect(html).not.toContain('Join meeting');
    expect(html).not.toContain('Reschedule or cancel');
  });

  it('greets a contact without a name as "there"', async () => {
    const { consumer, mail, sms } = build({ email: 'ana@x.com', phone: '+52155', first_name: null, last_name: null });
    await consumer.handleAppointmentCancelled({ ...booking, status: 'cancelled' });
    expect(sentEmail(mail).html).toContain('Hi there,');
    expect(((sms.send.mock.calls[0] as unknown[])[0] as { text: string }).text).toContain('Hi there, your appointment');
  });
});
