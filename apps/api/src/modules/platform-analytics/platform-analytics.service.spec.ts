/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';
import { PlatformAnalyticsService } from './platform-analytics.service';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('PlatformAnalyticsService.resolvePeriod', () => {
  const service = new PlatformAnalyticsService(null as never, null as never, null as never);

  it('defaults to the last 30 days, compared with the 30 days before', () => {
    const period = service.resolvePeriod({}, NOW);
    expect(period.to).toEqual(NOW);
    expect(period.from).toEqual(new Date(NOW.getTime() - 30 * DAY));
    expect(period.previousFrom).toEqual(new Date(NOW.getTime() - 60 * DAY));
    expect(period.days).toBe(30);
  });

  it.each([['7d', 7], ['90d', 90]] as const)('supports %s', (range, days) => {
    const period = service.resolvePeriod({ range }, NOW);
    expect(period.days).toBe(days);
    expect(NOW.getTime() - period.from.getTime()).toBe(days * DAY);
  });

  it('takes whole UTC days for a custom period, both ends included', () => {
    const period = service.resolvePeriod({ from: '2026-05-01', to: '2026-05-31' }, NOW);
    expect(period.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(period.previousFrom.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    expect(period.days).toBe(31);
    expect(service.resolvePeriod({ from: '2026-06-15', to: '2026-06-15' }, NOW).days).toBe(1);
  });

  it('stops a custom period at now', () => {
    const period = service.resolvePeriod({ from: '2026-06-01', to: '2026-06-15' }, NOW);
    expect(period.to).toEqual(NOW);
  });

  it.each([
    [{ from: '2026-05-01' }, 'needs both from and to'],
    [{ to: '2026-05-01' }, 'needs both from and to'],
    [{ from: '2026-05-10', to: '2026-05-01' }, 'on or before'],
    [{ from: '2026-02-30', to: '2026-03-01' }, 'must be a date'],
    [{ from: '2026-07-01', to: '2026-07-02' }, 'cannot be in the future'],
    [{ from: '2020-01-01', to: '2026-01-01' }, 'at most 731 days'],
  ])('rejects %j', (query, message) => {
    expect(() => service.resolvePeriod(query, NOW)).toThrow(BadRequestException);
    expect(() => service.resolvePeriod(query, NOW)).toThrow(message);
  });
});
