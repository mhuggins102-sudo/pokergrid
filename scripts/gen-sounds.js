#!/usr/bin/env node
//
// Generate WAV files for PokerGrid's sound effects. Run this once with
// `node scripts/gen-sounds.js` whenever the synth definitions change; the
// outputs go to assets/sounds/*.wav and are bundled via require() in the app.
//
// The synth is intentionally a mirror of src/ui/sound.ts so web (Web Audio)
// and native (expo-audio, plays the WAVs) sound the same.

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050; // good enough for short SFX, half the size of 44.1k
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/** Mix multiple wave generators into a single Float32 sample array. */
function mix(generators, durationSec, opts = {}) {
  const { sampleRate = SAMPLE_RATE } = opts;
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (const gen of generators) {
    for (let i = 0; i < n; i++) {
      out[i] += gen(i / sampleRate);
    }
  }
  // Soft clip to keep peaks bounded.
  for (let i = 0; i < n; i++) {
    const v = out[i];
    out[i] = v > 1 ? 1 - Math.exp(-(v - 1) * 2) : v < -1 ? -1 + Math.exp((v + 1) * 2) : v;
  }
  return out;
}

/** Single oscillator with linear-attack / exponential-decay envelope. */
function osc({ freq, vol = 0.18, dur, delay = 0, type = 'sine', endFreq }) {
  const attack = Math.min(0.01, dur * 0.25);
  return (t) => {
    if (t < delay) return 0;
    const lt = t - delay;
    if (lt > dur) return 0;
    const env =
      lt < attack
        ? (lt / attack) * vol
        : vol * Math.exp(-(lt - attack) * (6 / dur));
    let f = freq;
    if (endFreq !== undefined) {
      // Exponential sweep from freq to endFreq across `dur`.
      const k = Math.log(endFreq / freq) / dur;
      f = freq * Math.exp(k * lt);
    }
    const phase = 2 * Math.PI * f * lt;
    switch (type) {
      case 'square':
        return Math.sign(Math.sin(phase)) * env;
      case 'triangle':
        return (2 / Math.PI) * Math.asin(Math.sin(phase)) * env;
      case 'sawtooth':
        return (2 * (phase / (2 * Math.PI) - Math.floor(0.5 + phase / (2 * Math.PI)))) * env;
      default:
        return Math.sin(phase) * env;
    }
  };
}

/** Filtered noise burst (low-pass via running average). */
function noise({ vol = 0.22, dur, delay = 0, hz = 800 }) {
  // Pre-generate a noise buffer with simple LPF.
  const sr = SAMPLE_RATE;
  const n = Math.floor(dur * sr) + 1;
  const buf = new Float32Array(n);
  const alpha = Math.min(1, hz / sr * 4);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    prev = prev + alpha * (r - prev);
    buf[i] = prev;
  }
  const attack = Math.min(0.005, dur * 0.1);
  return (t) => {
    if (t < delay) return 0;
    const lt = t - delay;
    if (lt > dur) return 0;
    const env =
      lt < attack
        ? (lt / attack) * vol
        : vol * Math.exp(-(lt - attack) * (8 / dur));
    const idx = Math.floor(lt * sr);
    return buf[idx] * env;
  };
}

/** Encode a Float32 sample array as 16-bit PCM mono WAV. */
function encodeWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);             // PCM
  buf.writeUInt16LE(1, 22);             // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);             // block align
  buf.writeUInt16LE(16, 34);            // bits per sample
  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// ---------- The sound library (mirrors src/ui/sound.ts) ----------

const sounds = {
  tap:   { dur: 0.06, gens: [osc({ freq: 1400, dur: 0.04, vol: 0.06, type: 'triangle' })] },
  draw:  {
    dur: 0.18,
    gens: [
      osc({ freq: 660, dur: 0.06, type: 'sine', vol: 0.12 }),
      osc({ freq: 880, dur: 0.08, delay: 0.04, type: 'sine', vol: 0.10 }),
    ],
  },
  place: {
    dur: 0.22,
    gens: [
      osc({ freq: 440, dur: 0.12, type: 'sine', vol: 0.18 }),
      osc({ freq: 660, dur: 0.10, delay: 0.06, type: 'triangle', vol: 0.13 }),
    ],
  },
  swap: {
    dur: 0.32,
    gens: [
      osc({ freq: 523, dur: 0.10, type: 'triangle', vol: 0.16 }),
      osc({ freq: 698, dur: 0.10, delay: 0.08, type: 'triangle', vol: 0.16 }),
      osc({ freq: 523, dur: 0.10, delay: 0.18, type: 'triangle', vol: 0.13 }),
    ],
  },
  slide: {
    dur: 0.24,
    gens: [osc({ freq: 300, endFreq: 800, dur: 0.22, type: 'sawtooth', vol: 0.15 })],
  },
  destroy: {
    dur: 0.36,
    gens: [
      noise({ dur: 0.32, vol: 0.28, hz: 600 }),
      osc({ freq: 220, endFreq: 70, dur: 0.32, type: 'square', vol: 0.18 }),
      osc({ freq: 1400, endFreq: 200, dur: 0.18, delay: 0.02, type: 'sawtooth', vol: 0.10 }),
    ],
  },
  bonus: {
    dur: 0.40,
    gens: [
      osc({ freq: 523, dur: 0.10, type: 'triangle' }),
      osc({ freq: 659, dur: 0.10, delay: 0.10, type: 'triangle' }),
      osc({ freq: 784, dur: 0.16, delay: 0.20, type: 'triangle' }),
    ],
  },
  win: {
    dur: 0.74,
    gens: [
      osc({ freq: 523, dur: 0.12 }),
      osc({ freq: 659, dur: 0.12, delay: 0.12 }),
      osc({ freq: 784, dur: 0.12, delay: 0.24 }),
      osc({ freq: 1046, dur: 0.34, delay: 0.36, vol: 0.22 }),
    ],
  },
  lose: {
    dur: 0.80,
    gens: [
      osc({ freq: 440, dur: 0.18, type: 'triangle' }),
      osc({ freq: 330, dur: 0.18, delay: 0.18, type: 'triangle' }),
      osc({ freq: 196, dur: 0.42, delay: 0.36, type: 'sawtooth', vol: 0.16 }),
    ],
  },
};

let total = 0;
for (const [name, spec] of Object.entries(sounds)) {
  const samples = mix(spec.gens, spec.dur);
  const wav = encodeWav(samples);
  const out = path.join(OUT_DIR, `${name}.wav`);
  fs.writeFileSync(out, wav);
  total += wav.length;
  console.log(`  ${name.padEnd(8)} ${spec.dur.toFixed(2)}s  ${(wav.length / 1024).toFixed(1)} KB`);
}
console.log(`\nTotal: ${(total / 1024).toFixed(1)} KB across ${Object.keys(sounds).length} files`);
console.log(`Wrote ${OUT_DIR}`);
