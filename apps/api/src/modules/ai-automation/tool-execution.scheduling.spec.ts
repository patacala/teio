import { ToolExecutionService } from './tool-execution.service';

const CAL = '11111111-1111-4111-8111-111111111111';
const CONTACT = '22222222-2222-4222-8222-222222222222';

function build() {
  const scheduling = {
    findById: jest.fn(async (id: string) => ({ id, contact_id: CONTACT })),
    cancel: jest.fn(async (_org: string, id: string) => ({ id, status: 'cancelled' })),
    reschedule: jest.fn(async (_org: string, id: string, dto: { starts_at: string }) => ({
      id,
      status: 'confirmed',
      starts_at: new Date(dto.starts_at),
      ends_at: new Date(new Date(dto.starts_at).getTime() + 1_800_000),
      timezone: 'America/Mexico_City',
    })),
    createBooking: jest.fn(async (_org: string, dto: Record<string, unknown>) => ({
      id: 'appt-1',
      title: dto.title,
      status: 'scheduled',
      starts_at: new Date(String(dto.starts_at)),
      ends_at: new Date(new Date(String(dto.starts_at)).getTime() + Number(dto.duration_minutes) * 60_000),
      timezone: 'America/Mexico_City',
    })),
  };
  const availability = {
    getAvailability: jest.fn(async () => ({
      calendar_id: CAL,
      timezone: 'America/Mexico_City',
      duration_minutes: 30,
      slots: [{ starts_at: '2026-03-23T15:00:00.000Z', ends_at: '2026-03-23T15:30:00.000Z' }],
    })),
  };
  const calendars = {
    getCalendarById: jest.fn(async () => ({ id: CAL, name: 'Consultas', slot_duration_minutes: 45 })),
    listCalendars: jest.fn(async () => [
      { id: CAL, name: 'Consultas', type: 'appointments', is_active: true, timezone: 'America/Mexico_City', slot_duration_minutes: 45, min_notice_minutes: 60, max_advance_days: 30, system_key: 'appointments', payment_service_id: null },
      { id: 'paid', name: 'Evaluación', type: 'appointments', is_active: true, timezone: 'America/Mexico_City', slot_duration_minutes: 60, min_notice_minutes: 0, max_advance_days: null, system_key: null, payment_service_id: 'svc-1' },
      { id: 'fu', name: 'Follow-up', type: 'follow_up', is_active: true, timezone: 'UTC', slot_duration_minutes: 30, system_key: 'follow_up', payment_service_id: null },
      { id: 'off', name: 'Old', type: 'appointments', is_active: false, timezone: 'UTC', slot_duration_minutes: 30, system_key: null, payment_service_id: null },
    ]),
  };
  const sequences = { findActive: jest.fn(async () => null), cancel: jest.fn() };
  const mail = { send: jest.fn() };
  const sms = { send: jest.fn() };
  const service = new ToolExecutionService(
    { create: (x: unknown) => x, save: async (x: unknown) => x } as never,
    { findToolByName: async () => null } as never,
    {} as never,
    {} as never,
    scheduling as never,
    availability as never,
    calendars as never,
    { emit: jest.fn() } as never,
    mail as never,
    sms as never,
    sequences as never,
    undefined,
    undefined,
    { findAll: async () => [{ id: 'svc-1', name: 'Evaluación', amount: 50000 }] } as never,
  );
  return { service, scheduling, availability, calendars, mail, sms };
}

describe('scheduling tools', () => {
  it('get_available_slots accepts the advertised from/to and the old start_date/end_date', async () => {
    const { service, availability } = build();
    const run = async (input: Record<string, unknown>) =>
      (await service.execute('org', 'agent', 'get_available_slots', input)).result as Record<string, unknown>;

    const result = await run({ calendar_id: CAL, from: '2026-03-23', to: '2026-03-24' });
    expect(availability.getAvailability).toHaveBeenLastCalledWith('org', {
      from: '2026-03-23',
      to: '2026-03-24',
      calendar_id: CAL,
      duration_minutes: undefined,
    });
    expect(result).toMatchObject({
      timezone: 'America/Mexico_City',
      slots: [{ starts_at: '2026-03-23T15:00:00.000Z', local_start: '2026-03-23 09:00' }],
    });

    await run({ calendar_id: CAL, start_date: '2026-03-25', end_date: '2026-03-26' });
    expect(availability.getAvailability).toHaveBeenLastCalledWith('org', expect.objectContaining({ from: '2026-03-25', to: '2026-03-26' }));
  });

  it('publishes a schema whose properties are exactly what the tools read', () => {
    const tools = ToolExecutionService.getAvailableTools();
    const slots = tools.find((t) => t.name === 'get_available_slots');
    expect(Object.keys(slots!.input_schema.properties)).toEqual(['calendar_id', 'from', 'to', 'duration_minutes']);
    expect(slots!.input_schema.required).toEqual(['calendar_id', 'from', 'to']);
  });

  it('create_appointment books as the AI with calendar defaults and sends no SMS of its own', async () => {
    const { service, scheduling, mail, sms } = build();
    const execution = await service.execute('org', 'agent', 'create_appointment', {
      contact_id: CONTACT,
      calendar_id: CAL,
      starts_at: '2026-03-23T15:00:00Z',
    });
    expect(scheduling.createBooking).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({ title: 'Consultas', duration_minutes: 45, starts_at: '2026-03-23T15:00:00.000Z' }),
      { kind: 'ai' },
    );
    expect(execution.result).toMatchObject({ status: 'scheduled', local_start: '2026-03-23 09:00' });
    expect(mail.send).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('create_appointment rejects a missing calendar or a bad start with 400', async () => {
    const { service } = build();
    await expect(
      service.execute('org', 'agent', 'create_appointment', { contact_id: CONTACT, starts_at: '2026-03-23T15:00:00Z' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute('org', 'agent', 'create_appointment', { contact_id: CONTACT, calendar_id: CAL, starts_at: 'tomorrow' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('get_calendars lists bookable calendars and says which ones charge', async () => {
    const { service } = build();
    const result = (await service.execute('org', 'agent', 'get_calendars', {})).result as { calendars: Array<Record<string, unknown>> };
    expect(result.calendars.map((c) => c.id)).toEqual([CAL, 'paid']);
    expect(result.calendars[0]).toMatchObject({ is_default: true, charges: null, min_notice_minutes: 60 });
    expect(result.calendars[1]).toMatchObject({ charges: { service_id: 'svc-1', amount: 50000 } });
  });

  it('cancels and reschedules as the AI, only for the contact it talks to', async () => {
    const { service, scheduling } = build();
    const APPT = '33333333-3333-4333-8333-333333333333';
    await service.execute('org', 'agent', 'cancel_appointment', { appointment_id: APPT, contact_id: CONTACT });
    expect(scheduling.cancel).toHaveBeenCalledWith('org', APPT, { kind: 'ai' }, 'contact');

    const moved = await service.execute('org', 'agent', 'reschedule_appointment', {
      appointment_id: APPT,
      contact_id: CONTACT,
      starts_at: '2026-03-24T16:00:00Z',
    });
    expect(scheduling.reschedule).toHaveBeenCalledWith('org', APPT, { starts_at: '2026-03-24T16:00:00.000Z', duration_minutes: undefined }, { kind: 'ai' });
    expect(moved.result).toMatchObject({ local_start: '2026-03-24 10:00' });

    await expect(
      service.execute('org', 'agent', 'cancel_appointment', {
        appointment_id: APPT,
        contact_id: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
