import { forkJoin, from } from 'rxjs';
import { AckingRmqServer } from './acking-rmq.server';

function message(pattern: string, data: unknown) {
  return { content: Buffer.from(JSON.stringify({ pattern, data })), properties: {} };
}

function channel() {
  return { ack: jest.fn(), nack: jest.fn() };
}

describe('AckingRmqServer', () => {
  const server = new AckingRmqServer({ urls: ['amqp://test'], queue: 'crm_main' });

  it('acks only after every chained handler of the event finished', async () => {
    const finished: string[] = [];
    const slow = (name: string, ms: number) =>
      new Promise<void>((resolve) => setTimeout(() => {
        finished.push(name);
        resolve();
      }, ms));
    // What Nest builds for two @EventPattern handlers of one pattern: an Observable it never awaits.
    server.addHandler('appointment.confirmed', async () => forkJoin({ a: from(slow('email', 30)), b: from(slow('funnel', 10)) }), true);

    const ch = channel();
    await server.handleMessage(message('appointment.confirmed', {}) as never, ch as never);
    expect(finished.sort()).toEqual(['email', 'funnel']);
    expect(ch.ack).toHaveBeenCalledTimes(1);
    expect(ch.nack).not.toHaveBeenCalled();
  });

  it('sends a failed message to the dead-letter queue instead of dropping it', async () => {
    server.addHandler('payment.completed', async () => {
      throw new Error('db down');
    }, true);
    const ch = channel();
    await server.handleMessage(message('payment.completed', {}) as never, ch as never);
    expect(ch.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(ch.ack).not.toHaveBeenCalled();
  });

  it('acknowledges events nobody handles', async () => {
    const ch = channel();
    await server.handleMessage(message('nobody.listens', {}) as never, ch as never);
    expect(ch.ack).toHaveBeenCalledTimes(1);
  });
});
