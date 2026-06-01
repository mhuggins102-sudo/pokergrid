import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useSettings } from './settings';

// PokerGrid sound effects.
//
// Both platforms are covered:
//  - Native (iOS / Android via expo-audio): plays bundled WAV files from
//    assets/sounds/. Each sound is a single cached AudioPlayer; we
//    seek-to-zero on replay because expo-audio doesn't auto-rewind.
//  - Web (browser): synthesizes the same SFX live via Web Audio. We do
//    this to avoid asking the browser to fetch and decode small WAV blobs
//    every tap, and to keep first-play latency near zero.

export type SoundKey =
  | 'tap'
  | 'draw'
  | 'place'
  | 'swap'
  | 'slide'
  | 'destroy'
  | 'bonus'
  | 'joker'
  | 'win'
  | 'lose'
  | 'whoosh'   // Slip & Slide (distinct from regular slide)
  | 'boing'    // Jump, Jump (cartoon bounce)
  | 'shuffle'  // Shuffle pre-reveal sweep
  | 'thud'     // The Doubler (mallet hit on the picked card)
  | 'sparkle'; // Wildcard (magical twinkle)

// ---------- Native (expo-audio + bundled WAVs) ----------

// require() pulls the .wav files through Metro as static assets. The exact
// shape of the returned value differs per platform (a number on native, a
// URL-ish object on web), but expo-audio accepts both via createAudioPlayer.
// Stays Partial so future synth-only sounds can be added without a WAV;
// every key with an entry is played from the bundled clip on native.
const ASSETS: Partial<Record<SoundKey, number>> = {
  tap: require('../../assets/sounds/tap.wav'),
  draw: require('../../assets/sounds/draw.wav'),
  place: require('../../assets/sounds/place.wav'),
  swap: require('../../assets/sounds/swap.wav'),
  slide: require('../../assets/sounds/slide.wav'),
  destroy: require('../../assets/sounds/destroy.wav'),
  bonus: require('../../assets/sounds/bonus.wav'),
  joker: require('../../assets/sounds/joker.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
  whoosh: require('../../assets/sounds/whoosh.wav'),
  boing: require('../../assets/sounds/boing.wav'),
  shuffle: require('../../assets/sounds/shuffle.wav'),
  thud: require('../../assets/sounds/thud.wav'),
  sparkle: require('../../assets/sounds/sparkle.wav'),
};

const nativePlayers: Partial<Record<SoundKey, AudioPlayer>> = {};

const playNative = (k: SoundKey) => {
  const asset = ASSETS[k];
  // Web-only synth sound on a native build → silent. WAVs can be
  // added to assets/sounds/ later to enable them on native.
  if (asset === undefined) return;
  try {
    let p = nativePlayers[k];
    if (!p) {
      p = createAudioPlayer(asset);
      nativePlayers[k] = p;
    } else {
      // expo-audio doesn't auto-rewind; reset before replay so spammed taps
      // restart the clip rather than no-op.
      p.seekTo(0);
    }
    p.play();
  } catch {
    // Swallow — sound should never crash gameplay.
  }
};

// ---------- Web (Web Audio synthesis) ----------

type Note = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  endFreq?: number;
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

const playWeb = (k: SoundKey) => {
  switch (k) {
    case 'tap':
      return playNotes([{ freq: 1400, dur: 0.04, vol: 0.06, type: 'triangle' }]);
    case 'draw':
      return playNotes([
        { freq: 660, dur: 0.06, type: 'sine', vol: 0.12 },
        { freq: 880, dur: 0.08, delay: 0.04, type: 'sine', vol: 0.10 },
      ]);
    case 'place':
      return playNotes([
        { freq: 440, dur: 0.12, type: 'sine', vol: 0.18 },
        { freq: 660, dur: 0.10, delay: 0.06, type: 'triangle', vol: 0.13 },
      ]);
    case 'swap':
      return playNotes([
        { freq: 523, dur: 0.10, type: 'triangle', vol: 0.16 },
        { freq: 698, dur: 0.10, delay: 0.08, type: 'triangle', vol: 0.16 },
        { freq: 523, dur: 0.10, delay: 0.18, type: 'triangle', vol: 0.13 },
      ]);
    case 'slide':
      return playNotes([
        { freq: 300, endFreq: 800, dur: 0.22, type: 'sawtooth', vol: 0.15 },
      ]);
    case 'destroy':
      playNoise(0.32, { vol: 0.28, hz: 600 });
      playNotes([
        { freq: 220, endFreq: 70, dur: 0.32, type: 'square', vol: 0.18 },
        { freq: 1400, endFreq: 200, dur: 0.18, delay: 0.02, type: 'sawtooth', vol: 0.10 },
      ]);
      return;
    case 'bonus':
      return playNotes([
        { freq: 523, dur: 0.10, type: 'triangle' },
        { freq: 659, dur: 0.10, delay: 0.10, type: 'triangle' },
        { freq: 784, dur: 0.16, delay: 0.20, type: 'triangle' },
      ]);
    case 'joker':
      // Magical ascending Cmaj7 arpeggio with a high shimmer overlay. Matches
      // assets/sounds/joker.wav on native, synthesized live here on the web.
      return playNotes([
        { freq: 523.25, dur: 0.50, type: 'sine', vol: 0.16 },
        { freq: 659.25, dur: 0.50, delay: 0.10, type: 'sine', vol: 0.16 },
        { freq: 783.99, dur: 0.50, delay: 0.20, type: 'sine', vol: 0.16 },
        { freq: 987.77, dur: 0.42, delay: 0.30, type: 'sine', vol: 0.18 },
        { freq: 1567.98, dur: 0.42, delay: 0.30, type: 'triangle', vol: 0.07 },
        { freq: 1975.53, dur: 0.32, delay: 0.40, type: 'triangle', vol: 0.06 },
      ]);
    case 'win':
      return playNotes([
        { freq: 523, dur: 0.12 },
        { freq: 659, dur: 0.12, delay: 0.12 },
        { freq: 784, dur: 0.12, delay: 0.24 },
        { freq: 1046, dur: 0.34, delay: 0.36, vol: 0.22 },
      ]);
    case 'lose':
      return playNotes([
        { freq: 440, dur: 0.18, type: 'triangle' },
        { freq: 330, dur: 0.18, delay: 0.18, type: 'triangle' },
        { freq: 196, dur: 0.42, delay: 0.36, type: 'sawtooth', vol: 0.16 },
      ]);
    case 'whoosh':
      // Slip & Slide — longer noise sweep than the regular slide so
      // the ear distinguishes them. Pitch dives at the start, drifts
      // up again at the end for a "swooping past" effect.
      playNoise(0.32, { vol: 0.18, hz: 1600 });
      return playNotes([
        { freq: 240, endFreq: 90, dur: 0.18, type: 'sawtooth', vol: 0.10 },
        { freq: 110, endFreq: 480, dur: 0.20, delay: 0.14, type: 'sawtooth', vol: 0.10 },
      ]);
    case 'boing':
      // Jump, Jump — classic cartoon bounce. Quick pitch dive into a
      // bobbing sine wobble so it reads as "spring-loaded".
      return playNotes([
        { freq: 880, endFreq: 220, dur: 0.18, type: 'sine', vol: 0.20 },
        { freq: 330, endFreq: 480, dur: 0.10, delay: 0.18, type: 'sine', vol: 0.15 },
        { freq: 440, endFreq: 280, dur: 0.10, delay: 0.28, type: 'sine', vol: 0.10 },
      ]);
    case 'shuffle':
      // Shuffle — a short burst of filtered noise twice in quick
      // succession to evoke a riffle. The two staggered bursts read
      // as "cards crossing".
      playNoise(0.20, { vol: 0.22, hz: 1200 });
      setTimeout(() => playNoise(0.18, { vol: 0.18, hz: 1500 }), 140);
      return;
    case 'thud':
      // The Doubler — short, low mallet hit. Quick low-frequency
      // sine punch backed by a touch of filtered noise for the
      // "impact" thump.
      playNoise(0.10, { vol: 0.20, hz: 220 });
      return playNotes([
        { freq: 120, endFreq: 60, dur: 0.16, type: 'sine', vol: 0.28 },
      ]);
    case 'sparkle':
      // Wildcard — magical twinkle. Ascending tetrad of bright sine
      // pulses with a sliver of high-octave shimmer on top, evoking
      // the same "this card became special" feel as the joker
      // arpeggio but compressed into a single beat.
      return playNotes([
        { freq: 1320, dur: 0.10, type: 'sine', vol: 0.14 },
        { freq: 1760, dur: 0.10, delay: 0.06, type: 'sine', vol: 0.14 },
        { freq: 2093, dur: 0.10, delay: 0.12, type: 'sine', vol: 0.14 },
        { freq: 2640, dur: 0.18, delay: 0.18, type: 'sine', vol: 0.12 },
        { freq: 3520, dur: 0.14, delay: 0.18, type: 'triangle', vol: 0.06 },
      ]);
  }
};

// ---------- Public API ----------

export const useSound = () => {
  const { settings } = useSettings();
  return useCallback(
    (k: SoundKey) => {
      if (!settings.sounds) return;
      try {
        if (Platform.OS === 'web') playWeb(k);
        else playNative(k);
      } catch {
        // never throw — sound is a nice-to-have
      }
    },
    [settings.sounds]
  );
};
