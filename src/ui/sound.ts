import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useSettings } from './settings';

// PokerGrid sound effects.
//
// All effects are synthesized at runtime via Web Audio (no bundled audio
// files). On native, this currently no-ops — adding expo-audio + bundled
// clips is a follow-up. Synthesis is good enough for the neon arcade
// vibe: short clicks, sweeps, and arpeggios.

type Note = {
  freq: number;
  dur: number;       // seconds
  type?: OscillatorType;
  vol?: number;      // peak gain (0..1)
  delay?: number;    // seconds offset from "now"
  endFreq?: number;  // for a frequency sweep
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

const audioOK = (): boolean =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof (window as unknown as { AudioContext?: unknown }).AudioContext !== 'undefined';

const getCtx = (): { ctx: AudioContext; master: GainNode } | null => {
  if (!audioOK()) return null;
  if (!ctx) {
    const AC = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(ctx.destination);
  }
  // Browsers suspend the context until a user gesture; resume on every play.
  if (ctx.state === 'suspended') ctx.resume();
  return { ctx, master: masterGain! };
};

const playNotes = (notes: Note[]) => {
  const a = getCtx();
  if (!a) return;
  const { ctx: c, master } = a;
  const now = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(master);
    osc.type = n.type ?? 'sine';
    const t0 = now + (n.delay ?? 0);
    if (n.endFreq !== undefined) {
      osc.frequency.setValueAtTime(n.freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, n.endFreq), t0 + n.dur);
    } else {
      osc.frequency.value = n.freq;
    }
    const peak = n.vol ?? 0.18;
    g.gain.setValueAtTime(0.00001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, n.dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.00001, t0 + n.dur);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.02);
  }
};

// A short burst of filtered noise (used for the destroy "explosion").
const playNoise = (duration: number, opts?: { vol?: number; hz?: number }) => {
  const a = getCtx();
  if (!a) return;
  const { ctx: c, master } = a;
  const now = c.currentTime;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = opts?.hz ?? 800;
  const g = c.createGain();
  g.gain.setValueAtTime(opts?.vol ?? 0.22, now);
  g.gain.exponentialRampToValueAtTime(0.00001, now + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now);
  src.stop(now + duration + 0.02);
};

// ---- The library ----

export const sounds = {
  tap:   () => playNotes([{ freq: 1400, dur: 0.04, vol: 0.06, type: 'triangle' }]),
  draw:  () => playNotes([
    { freq: 660, dur: 0.06, type: 'sine', vol: 0.12 },
    { freq: 880, dur: 0.08, delay: 0.04, type: 'sine', vol: 0.10 },
  ]),
  place: () => playNotes([
    { freq: 440, dur: 0.12, type: 'sine', vol: 0.18 },
    { freq: 660, dur: 0.10, delay: 0.06, type: 'triangle', vol: 0.13 },
  ]),
  swap:  () => playNotes([
    { freq: 523, dur: 0.10, type: 'triangle', vol: 0.16 },
    { freq: 698, dur: 0.10, delay: 0.08, type: 'triangle', vol: 0.16 },
    { freq: 523, dur: 0.10, delay: 0.18, type: 'triangle', vol: 0.13 },
  ]),
  slide: () => playNotes([
    { freq: 300, endFreq: 800, dur: 0.22, type: 'sawtooth', vol: 0.15 },
  ]),
  destroy: () => {
    playNoise(0.32, { vol: 0.28, hz: 600 });
    playNotes([
      { freq: 220, endFreq: 70, dur: 0.32, type: 'square', vol: 0.18 },
      { freq: 1400, endFreq: 200, dur: 0.18, delay: 0.02, type: 'sawtooth', vol: 0.10 },
    ]);
  },
  bonus: () => playNotes([
    { freq: 523, dur: 0.10, type: 'triangle' },
    { freq: 659, dur: 0.10, delay: 0.10, type: 'triangle' },
    { freq: 784, dur: 0.16, delay: 0.20, type: 'triangle' },
  ]),
  win: () => playNotes([
    { freq: 523, dur: 0.12 },
    { freq: 659, dur: 0.12, delay: 0.12 },
    { freq: 784, dur: 0.12, delay: 0.24 },
    { freq: 1046, dur: 0.34, delay: 0.36, vol: 0.22 },
  ]),
  lose: () => playNotes([
    { freq: 440, dur: 0.18, type: 'triangle' },
    { freq: 330, dur: 0.18, delay: 0.18, type: 'triangle' },
    { freq: 196, dur: 0.42, delay: 0.36, type: 'sawtooth', vol: 0.16 },
  ]),
} as const;

export type SoundKey = keyof typeof sounds;

export const useSound = () => {
  const { settings } = useSettings();
  return useCallback(
    (k: SoundKey) => {
      if (!settings.sounds) return;
      try { sounds[k](); } catch {}
    },
    [settings.sounds]
  );
};
