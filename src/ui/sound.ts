import type { TurnEffect } from './turnEffect';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short filtered noise burst: the "snap" of a card. */
function snap(freq: number, dur: number, vol: number) {
  const a = audio();
  if (!a) return;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const gain = a.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

function tone(freq: number, at: number, dur: number, vol: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playSound(e: TurnEffect | 'win' | 'nope'): void {
  switch (e) {
    case 'draw':
      snap(2600, 0.05, 0.35);
      break;
    case 'recycle':
      snap(1400, 0.14, 0.3);
      break;
    case 'flip':
      snap(1200, 0.07, 0.45);
      break;
    case 'foundation':
      snap(1800, 0.05, 0.35);
      tone(880, 0, 0.12, 0.06);
      break;
    case 'move':
      snap(1700, 0.05, 0.4);
      break;
    case 'nope':
      tone(160, 0, 0.14, 0.08);
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.4, 0.1));
      break;
  }
}
