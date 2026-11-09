import { Logger } from '@nestjs/common';

/**
 * Fire-and-forget side effects (webhooks, notifications, queue writes) must
 * never take the whole API down. Since Node 15 an unhandled promise rejection
 * terminates the process; log it instead so one failing Redis/HTTP call does
 * not stop every tenant.
 */
export function registerProcessSafetyNet(logger: Pick<Logger, 'error'> = new Logger('Process')): (reason: unknown) => void {
  const handler = (reason: unknown) => {
    const detail = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    logger.error(`Unhandled promise rejection: ${detail}`);
  };
  process.on('unhandledRejection', handler);
  return handler;
}
