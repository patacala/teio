import { ActionExecutionService } from './action-execution.service';

describe('ActionExecutionService hand-over (executor = user)', () => {
  function setup(step: Record<string, unknown>) {
    const actions = {
      findForExecution: jest.fn(async () => ({ id: 's1', organization_id: 'org', contact_id: 'c1', status: 'processing', title: 'Call Ana', ...step })),
      markAwaitingUser: jest.fn(async () => true),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    };
    const realtime = { notifyOrg: jest.fn(async () => undefined) };
    const sendMessage = { actionType: 'send_message', execute: jest.fn() };
    const service = new ActionExecutionService(
      actions as never,
      { advanceOrComplete: jest.fn() } as never,
      { resolve: jest.fn(async () => null) } as never,
      { findOne: jest.fn(async () => ({ id: 'c1', first_name: 'Ana', last_name: 'Pérez' })) } as never,
      { findOne: jest.fn(async () => ({ id: 'org' })) } as never,
      realtime as never,
      undefined,
      sendMessage as never,
    );
    return { service, actions, realtime, sendMessage };
  }

  it('waits for a person instead of running a step they own', async () => {
    const { service, actions, realtime, sendMessage } = setup({ action: 'send_message', executor: 'user' });
    await service.execute('s1');
    expect(actions.markAwaitingUser).toHaveBeenCalledWith('org', 's1');
    expect(sendMessage.execute).not.toHaveBeenCalled();
    expect(actions.markCompleted).not.toHaveBeenCalled();
    expect(realtime.notifyOrg).toHaveBeenCalledWith('org', expect.objectContaining({ title: 'Follow-up due: Call Ana' }));
  });

  it('treats create_task as work for a person', async () => {
    const { service, actions } = setup({ action: 'create_task', executor: 'system' });
    await service.execute('s1');
    expect(actions.markAwaitingUser).toHaveBeenCalled();
  });
});
