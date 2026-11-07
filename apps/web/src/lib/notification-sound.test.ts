import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SoundModule = typeof import('./notification-sound');

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState: AudioContextState = 'running';
  static resumeFails = false;

  state: AudioContextState = FakeAudioContext.initialState;
  currentTime = 10;
  destination = {};
  oscillators: { frequency: number; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  gains: { connect: ReturnType<typeof vi.fn> }[] = [];

  resume = vi.fn(async () => {
    if (FakeAudioContext.resumeFails) throw new Error('blocked by autoplay policy');
    this.state = 'running';
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const record = { frequency: 0, start: vi.fn(), stop: vi.fn() };
    this.oscillators.push(record);
    return {
      type: 'square',
      frequency: { setValueAtTime: (value: number) => (record.frequency = value) },
      connect: vi.fn(),
      start: record.start,
      stop: record.stop,
    };
  }
}

let sound: SoundModule;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  vi.resetModules();
  FakeAudioContext.instances = [];
  FakeAudioContext.initialState = 'running';
  FakeAudioContext.resumeFails = false;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
  sound = await import('./notification-sound');
});

afterEach(() => {
  vi.useRealTimers();
});

const ctx = () => FakeAudioContext.instances[0];

describe('playNotificationSound', () => {
  it('plays a two-tone chime through a single gain node', async () => {
    sound.playNotificationSound();
    await flush();

    expect(ctx().gains).toHaveLength(1);
    expect(ctx().gains[0].connect).toHaveBeenCalledWith(ctx().destination);
    expect(ctx().oscillators.map((o) => o.frequency)).toEqual([880, 1175]);
    expect(ctx().oscillators[0].start).toHaveBeenCalledWith(10);
    expect(ctx().oscillators[1].start).toHaveBeenCalledWith(10.09);
    expect(ctx().oscillators[1].stop).toHaveBeenCalledWith(10.42);
  });

  it('reuses the same AudioContext across plays', async () => {
    sound.playNotificationSound();
    await flush();
    vi.setSystemTime(Date.now() + 5_000);
    sound.playNotificationSound();
    await flush();

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx().oscillators).toHaveLength(4);
  });

  it('throttles plays that happen within 1.2 seconds', async () => {
    sound.playNotificationSound();
    await flush();
    vi.setSystemTime(Date.now() + 1_199);
    sound.playNotificationSound();
    await flush();
    expect(ctx().oscillators).toHaveLength(2);

    vi.setSystemTime(Date.now() + 1);
    sound.playNotificationSound();
    await flush();
    expect(ctx().oscillators).toHaveLength(4);
  });

  it('resumes a suspended context before playing', async () => {
    FakeAudioContext.initialState = 'suspended';

    sound.playNotificationSound();
    await flush();

    expect(ctx().resume).toHaveBeenCalled();
    expect(ctx().oscillators).toHaveLength(2);
  });

  it('skips the chime and releases the throttle when the context cannot be resumed', async () => {
    FakeAudioContext.initialState = 'suspended';
    FakeAudioContext.resumeFails = true;

    sound.playNotificationSound();
    await flush();
    expect(ctx().oscillators).toHaveLength(0);

    FakeAudioContext.resumeFails = false;
    sound.playNotificationSound();
    await flush();
    expect(ctx().oscillators).toHaveLength(2);
  });

  it('does nothing when the browser has no Web Audio support', async () => {
    vi.stubGlobal('AudioContext', undefined);

    expect(() => sound.playNotificationSound()).not.toThrow();
    await flush();

    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});

describe('unlockNotificationSound', () => {
  it('resumes a suspended context', () => {
    FakeAudioContext.initialState = 'suspended';

    sound.unlockNotificationSound();

    expect(ctx().resume).toHaveBeenCalledTimes(1);
  });

  it('leaves a running context alone', () => {
    sound.unlockNotificationSound();

    expect(ctx().resume).not.toHaveBeenCalled();
  });
});
