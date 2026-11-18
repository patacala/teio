import { callStartedNotification } from './calls.service';

describe('callStartedNotification (English in-app notification)', () => {
  it('incoming call: who is calling', () => {
    expect(callStartedNotification('inbound', '+15550001', '+15550002')).toEqual({ title: 'Incoming call', description: 'From +15550001' });
    expect(callStartedNotification(undefined, '+15550001', '+15550002')).toEqual({ title: 'Incoming call', description: 'From +15550001' });
  });

  it('outgoing call: who we are calling', () => {
    expect(callStartedNotification('outbound', '+15550001', '+15550002')).toEqual({ title: 'Outgoing call', description: 'To +15550002' });
  });
});
