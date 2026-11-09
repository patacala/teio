/// <reference types="jest" />
import { registerProcessSafetyNet } from './process-safety';

describe('registerProcessSafetyNet', () => {
  it('registers a process-wide handler for unhandled rejections', () => {
    const handler = registerProcessSafetyNet({ error: jest.fn() });
    try {
      expect(process.listeners('unhandledRejection')).toContain(handler);
    } finally {
      process.off('unhandledRejection', handler);
    }
  });

  it('logs the error with its stack instead of letting it terminate the process', () => {
    const logger = { error: jest.fn() };
    const handler = registerProcessSafetyNet(logger);
    process.off('unhandledRejection', handler);
    handler(new Error('Redis connection reset'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/Unhandled promise rejection: Error: Redis connection reset\n\s+at /));
  });

  it('logs non-Error rejection reasons too', () => {
    const logger = { error: jest.fn() };
    const handler = registerProcessSafetyNet(logger);
    process.off('unhandledRejection', handler);
    handler('timeout');
    expect(logger.error).toHaveBeenCalledWith('Unhandled promise rejection: timeout');
  });
});
