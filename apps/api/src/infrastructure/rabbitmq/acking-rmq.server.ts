import { Logger } from '@nestjs/common';
import { RmqOptions, ServerRMQ } from '@nestjs/microservices';
import { isObservable, lastValueFrom } from 'rxjs';

export const DEAD_LETTER_EXCHANGE = 'dlx';
export const DEAD_LETTER_QUEUE = 'dlq.main';

type Channel = {
  ack(message: unknown): void;
  nack(message: unknown, allUpTo?: boolean, requeue?: boolean): void;
  assertExchange(name: string, type: string, options: Record<string, unknown>): Promise<unknown>;
  assertQueue(name: string, options: Record<string, unknown>): Promise<unknown>;
  bindQueue(queue: string, exchange: string, pattern: string): Promise<unknown>;
};

/**
 * RabbitMQ consumer with manual acknowledgements. A message is acked only
 * after EVERY @EventPattern handler registered for it has finished (Nest
 * chains several handlers of one pattern into a single Observable it does not
 * wait for), and a handler failure sends it to the dead-letter queue instead
 * of dropping it.
 */
export class AckingRmqServer extends ServerRMQ {
  private readonly ackLogger = new Logger('AckingRmqServer');

  constructor(options: RmqOptions['options']) {
    super({ ...options, noAck: false });
  }

  async setupChannel(channel: Channel, callback: () => void): Promise<void> {
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE);
    return super.setupChannel(channel, callback);
  }

  async handleMessage(message: Record<string, unknown> | null, channel: Channel): Promise<void> {
    if (!message) return;
    try {
      await super.handleMessage(message, channel);
      channel.ack(message);
    } catch (err) {
      this.ackLogger.error(`Message failed, sent to ${DEAD_LETTER_QUEUE}: ${(err as Error).message}`);
      channel.nack(message, false, false);
    }
  }

  async handleEvent(pattern: string, packet: { data: unknown }, context: unknown): Promise<unknown> {
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      this.ackLogger.warn(`No handler for event ${pattern}; acknowledging and dropping it`);
      return undefined;
    }
    const result = await handler(packet.data, context as never);
    if (isObservable(result)) await lastValueFrom(result, { defaultValue: undefined });
    return undefined;
  }
}
