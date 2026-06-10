// Pending-submit queue semantics. The queue is what makes a daily
// score durable: recordCompletion enqueues BEFORE the first network
// attempt and the drain only removes an entry once the server
// confirms. These tests pin that ordering plus the drain's
// per-failure-mode behavior, and the withTimeout helper that keeps a
// stalled RPC from hanging the rank panel forever.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueuePendingSubmit,
  getPendingSubmits,
  removePendingSubmit,
  PendingSubmit,
} from '../src/ui/daily/localStore';
import { drainPendingSubmitsOnce } from '../src/ui/daily/submitQueue';
import {
  AlreadySubmittedError,
  BackendUnavailableError,
  withTimeout,
} from '../src/ui/daily/supabase';

const entry = (dateISO: string, deviceId = 'dev-1'): PendingSubmit => ({
  deviceId,
  dateISO,
  score: 450,
  won: true,
  recipe: { difficulty: 'medium' },
  usedUndo: false,
  enqueuedAt: 0,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('pending-submit queue storage', () => {
  it('enqueue is idempotent per (deviceId, dateISO)', async () => {
    await enqueuePendingSubmit(entry('2026-06-10'));
    await enqueuePendingSubmit(entry('2026-06-10'));
    await enqueuePendingSubmit(entry('2026-06-11'));
    const pending = await getPendingSubmits();
    expect(pending.map(p => p.dateISO)).toEqual(['2026-06-10', '2026-06-11']);
  });

  it('remove deletes only the matching entry', async () => {
    await enqueuePendingSubmit(entry('2026-06-10'));
    await enqueuePendingSubmit(entry('2026-06-11'));
    await removePendingSubmit('dev-1', '2026-06-10');
    const pending = await getPendingSubmits();
    expect(pending.map(p => p.dateISO)).toEqual(['2026-06-11']);
  });
});

describe('drainPendingSubmitsOnce', () => {
  const deps = (submit: (p: PendingSubmit) => Promise<void>) => ({
    getPendingSubmits,
    removePendingSubmit,
    submit,
  });

  it('successful submit removes the entry and reports anySubmitted', async () => {
    await enqueuePendingSubmit(entry('2026-06-10'));
    const result = await drainPendingSubmitsOnce(
      deps(async () => undefined)
    );
    expect(result).toEqual({ anySubmitted: true, lastError: null });
    expect(await getPendingSubmits()).toEqual([]);
  });

  it('AlreadySubmittedError counts as submitted and drops the entry', async () => {
    await enqueuePendingSubmit(entry('2026-06-10'));
    const result = await drainPendingSubmitsOnce(
      deps(async () => {
        throw new AlreadySubmittedError();
      })
    );
    expect(result.anySubmitted).toBe(true);
    expect(result.lastError).toBeNull();
    expect(await getPendingSubmits()).toEqual([]);
  });

  it('transient failure keeps the entry queued and surfaces lastError', async () => {
    // The queue-first regression guard: a play whose submit fails (or
    // whose tab dies mid-flight, same observable state) must still be
    // on disk so a later drain can deliver it.
    await enqueuePendingSubmit(entry('2026-06-10'));
    const boom = new Error('network down');
    const result = await drainPendingSubmitsOnce(
      deps(async () => {
        throw boom;
      })
    );
    expect(result.anySubmitted).toBe(false);
    expect(result.lastError).toEqual({ dateISO: '2026-06-10', error: boom });
    expect((await getPendingSubmits()).map(p => p.dateISO)).toEqual([
      '2026-06-10',
    ]);
  });

  it('BackendUnavailableError aborts the pass without dropping entries', async () => {
    await enqueuePendingSubmit(entry('2026-06-10'));
    await enqueuePendingSubmit(entry('2026-06-11'));
    const submit = jest.fn(async () => {
      throw new BackendUnavailableError();
    });
    const result = await drainPendingSubmitsOnce(deps(submit));
    expect(result.anySubmitted).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    expect((await getPendingSubmits()).length).toBe(2);
  });

  it('mixed queue: failure on one entry does not block the next', async () => {
    await enqueuePendingSubmit(entry('2026-06-10'));
    await enqueuePendingSubmit(entry('2026-06-11'));
    const result = await drainPendingSubmitsOnce(
      deps(async p => {
        if (p.dateISO === '2026-06-10') throw new Error('flaky');
      })
    );
    expect(result.anySubmitted).toBe(true);
    expect(result.lastError?.dateISO).toBe('2026-06-10');
    expect((await getPendingSubmits()).map(p => p.dateISO)).toEqual([
      '2026-06-10',
    ]);
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes through a resolution and clears its timer', async () => {
    const result = await withTimeout(
      Promise.resolve('ok'),
      10_000,
      () => new Error('timeout')
    );
    expect(result).toBe('ok');
    // The deadline timer must be cleaned up when the call wins —
    // otherwise every successful RPC leaks a live 10-20s timer.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects with the supplied error once the deadline passes', async () => {
    const never = new Promise<never>(() => {});
    const p = withTimeout(never, 10_000, () => new Error('rank timeout'));
    // Attach the expectation before advancing so the rejection is
    // observed (no unhandled-rejection warning).
    const assertion = expect(p).rejects.toThrow('rank timeout');
    jest.advanceTimersByTime(10_000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
});
