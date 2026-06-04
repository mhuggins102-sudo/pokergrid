#!/usr/bin/env python3
"""
Synthesize WAV files for the five new sound effects (whoosh, boing,
shuffle, thud, sparkle) by mirroring the Web Audio synth recipes in
src/ui/sound.ts. Output is 16-bit mono PCM at 44.1 kHz, matching the
existing bundled WAVs in assets/sounds/.
"""

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
OUT_DIR = '/home/user/pokergrid/assets/sounds'


def make_buffer(duration: float) -> list:
    """Return a zero-filled float buffer long enough for `duration` seconds."""
    n = int(duration * SAMPLE_RATE) + 256  # small tail for the safety margin
    return [0.0] * n


def gain_at(t: float, attack: float, dur: float, peak: float) -> float:
    """
    Mirror Web Audio's `exponentialRampToValueAtTime` envelope:
      0..attack    : ~0 -> peak (exponential)
      attack..dur  : peak -> ~0 (exponential)
    """
    if t < 0 or t >= dur:
        return 0.0
    if t < attack:
        # exponential ramp from 0.00001 to peak
        if attack <= 0:
            return peak
        return 0.00001 * (peak / 0.00001) ** (t / attack)
    rem = dur - attack
    if rem <= 0:
        return peak
    progress = (t - attack) / rem
    # peak * (target/peak) ** progress, target = 0.00001
    return peak * (0.00001 / peak) ** progress


def freq_at(t: float, f0: float, f1: float, dur: float) -> float:
    """Exponential frequency ramp from f0 to f1 over `dur` seconds."""
    if f1 is None or f0 == f1 or dur <= 0:
        return f0
    progress = max(0.0, min(1.0, t / dur))
    return f0 * (f1 / f0) ** progress


def osc_sample(phase: float, kind: str) -> float:
    """One sample of the named oscillator at the given phase (radians)."""
    if kind == 'sine':
        return math.sin(phase)
    if kind == 'triangle':
        # phase normalized to 0..1 within one cycle
        x = (phase / (2 * math.pi)) % 1.0
        return 4 * abs(x - 0.5) - 1
    if kind == 'sawtooth':
        x = (phase / (2 * math.pi)) % 1.0
        return 2 * x - 1
    if kind == 'square':
        x = (phase / (2 * math.pi)) % 1.0
        return 1.0 if x < 0.5 else -1.0
    raise ValueError(f'unknown osc kind: {kind}')


def add_note(
    buf: list,
    *,
    freq: float,
    dur: float,
    delay: float = 0.0,
    vol: float = 0.18,
    end_freq: float = None,
    kind: str = 'sine',
):
    """
    Mix a single oscillator note into `buf` starting at `delay` seconds.
    Mirrors the synth path in src/ui/sound.ts (playNotes).
    """
    attack = min(0.015, dur * 0.3)
    start_sample = int(delay * SAMPLE_RATE)
    n_samples = int(dur * SAMPLE_RATE)
    phase = 0.0
    dt = 1.0 / SAMPLE_RATE
    for i in range(n_samples):
        t = i * dt
        f = freq_at(t, freq, end_freq, dur) if end_freq is not None else freq
        # accumulate phase using the *current* instantaneous frequency
        phase += 2 * math.pi * f * dt
        g = gain_at(t, attack, dur, vol)
        s = osc_sample(phase, kind) * g
        out_idx = start_sample + i
        if 0 <= out_idx < len(buf):
            buf[out_idx] += s


def add_noise(
    buf: list,
    *,
    duration: float,
    delay: float = 0.0,
    vol: float = 0.22,
    hz: float = 800.0,
):
    """
    Mix lowpass-filtered white noise into `buf`. Mirrors the playNoise
    helper in src/ui/sound.ts (1-pole biquad-lowpass-equivalent via a
    simple IIR).
    """
    start_sample = int(delay * SAMPLE_RATE)
    n_samples = int(duration * SAMPLE_RATE)
    rc = 1.0 / (2 * math.pi * hz)
    dt = 1.0 / SAMPLE_RATE
    alpha = dt / (rc + dt)
    rng = random.Random(0xC0FFEE)  # deterministic so re-running matches
    last = 0.0
    # Volume envelope: exponential decay over the whole duration
    for i in range(n_samples):
        t = i * dt
        # rng is seeded but each note advances it independently
        raw = rng.uniform(-1.0, 1.0)
        last = last + alpha * (raw - last)
        progress = t / duration if duration > 0 else 1.0
        env = vol * (0.00001 / vol) ** progress
        out_idx = start_sample + i
        if 0 <= out_idx < len(buf):
            buf[out_idx] += last * env


def write_wav(buf: list, path: str) -> None:
    """Write 16-bit mono PCM at SAMPLE_RATE.

    Peak-normalizes each clip to PEAK_TARGET so the bundled WAVs all
    land at the same maximum amplitude. Without normalization the
    per-recipe `vol` values would have to be hand-tuned for each sound
    to match the perceived loudness of the others — instead we let
    the math do the equalization.
    """
    # Trim trailing silence to keep file sizes reasonable.
    end = len(buf)
    while end > 0 and abs(buf[end - 1]) < 1e-6:
        end -= 1
    # Peak normalization: scale the buffer so its loudest sample sits
    # at PEAK_TARGET. The existing bundled WAVs (tap / place / swap /
    # slide / bonus / lose) peak around 0.14–0.18 with the bigger
    # moments (destroy / win) at 0.22–0.24. Targeting 0.22 keeps the
    # new specials at the same perceived loudness as the existing
    # gameplay sounds — without this they'd run ~4x louder than the
    # rest of the soundscape and stand out as off-balance.
    PEAK_TARGET = 0.22
    peak = max(abs(v) for v in buf[:end]) if end > 0 else 0.0
    gain = (PEAK_TARGET / peak) if peak > 1e-6 else 0.0
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for v in buf[:end]:
            x = max(-1.0, min(1.0, v * gain))
            frames += struct.pack('<h', int(x * 32767))
        w.writeframes(bytes(frames))


# -------- recipes (1-for-1 with src/ui/sound.ts playWeb) --------

def make_whoosh() -> list:
    buf = make_buffer(0.45)
    # Lowpass-filtered noise sweep (longer than regular slide).
    add_noise(buf, duration=0.32, vol=0.18, hz=1600)
    # Downward sawtooth dive.
    add_note(buf, freq=240, end_freq=90, dur=0.18, kind='sawtooth', vol=0.10)
    # Upward sawtooth recovery — delayed so the two pieces don't pile.
    add_note(buf, freq=110, end_freq=480, dur=0.20, delay=0.14, kind='sawtooth', vol=0.10)
    return buf


def make_boing() -> list:
    buf = make_buffer(0.45)
    add_note(buf, freq=880, end_freq=220, dur=0.18, kind='sine', vol=0.20)
    add_note(buf, freq=330, end_freq=480, dur=0.10, delay=0.18, kind='sine', vol=0.15)
    add_note(buf, freq=440, end_freq=280, dur=0.10, delay=0.28, kind='sine', vol=0.10)
    return buf


def make_shuffle() -> list:
    """Riffle shuffle — 10 quick noise ticks (cards interleaving) plus
    a soft squaring-up swoosh at the end."""
    buf = make_buffer(0.65)
    for i in range(10):
        add_noise(buf, duration=0.022, delay=i * 0.032, vol=0.20, hz=2400)
    add_noise(buf, duration=0.20, delay=0.36, vol=0.14, hz=1100)
    return buf


def make_thud() -> list:
    """The Doubler — low sine sweep for the body, plus a brighter
    mid-frequency triangle click on top so small speakers can
    actually reproduce the hit."""
    buf = make_buffer(0.32)
    add_noise(buf, duration=0.10, vol=0.30, hz=320)
    add_note(buf, freq=120, end_freq=55, dur=0.20, kind='sine', vol=0.42)
    add_note(buf, freq=920, end_freq=240, dur=0.08, kind='triangle', vol=0.22)
    return buf


def make_sparkle() -> list:
    buf = make_buffer(0.45)
    add_note(buf, freq=1320, dur=0.10, kind='sine', vol=0.14)
    add_note(buf, freq=1760, dur=0.10, delay=0.06, kind='sine', vol=0.14)
    add_note(buf, freq=2093, dur=0.10, delay=0.12, kind='sine', vol=0.14)
    add_note(buf, freq=2640, dur=0.18, delay=0.18, kind='sine', vol=0.12)
    add_note(buf, freq=3520, dur=0.14, delay=0.18, kind='triangle', vol=0.06)
    return buf


def make_plus_minus() -> list:
    """Plus/Minus rank shift — quick two-tone tick (low → high sine
    pair) that reads as a single-step adjustment. Symmetric across
    +1 and -1; the player sees the direction in the rendered card."""
    buf = make_buffer(0.25)
    add_note(buf, freq=660, dur=0.06, kind='sine', vol=0.18)
    add_note(buf, freq=990, dur=0.10, delay=0.05, kind='sine', vol=0.18)
    return buf


RECIPES = {
    'whoosh': make_whoosh,
    'boing': make_boing,
    'shuffle': make_shuffle,
    'thud': make_thud,
    'sparkle': make_sparkle,
    'plus-minus': make_plus_minus,
}


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, recipe in RECIPES.items():
        buf = recipe()
        path = os.path.join(OUT_DIR, f'{name}.wav')
        write_wav(buf, path)
        size = os.path.getsize(path)
        print(f'wrote {path} ({size} bytes)')
