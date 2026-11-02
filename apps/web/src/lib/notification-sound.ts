let ctx: AudioContext | null = null;
let lastPlayedAt = 0;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockNotificationSound() {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
}

export function playNotificationSound() {
  const nowMs = Date.now();
  if (nowMs - lastPlayedAt < 1200) return;
  lastPlayedAt = nowMs;

  void (async () => {
    const audio = getContext();
    if (!audio) {
      lastPlayedAt = 0;
      return;
    }
    if (audio.state === 'suspended') {
      try {
        await audio.resume();
      } catch {
        lastPlayedAt = 0;
        return;
      }
    }
    if (audio.state !== 'running') {
      lastPlayedAt = 0;
      return;
    }

    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.18, now + 0.015);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    master.connect(audio.destination);

    const ding = audio.createOscillator();
    ding.type = 'sine';
    ding.frequency.setValueAtTime(880, now);
    ding.connect(master);
    ding.start(now);
    ding.stop(now + 0.22);

    const dong = audio.createOscillator();
    dong.type = 'sine';
    dong.frequency.setValueAtTime(1175, now + 0.09);
    dong.connect(master);
    dong.start(now + 0.09);
    dong.stop(now + 0.42);
  })();
}
