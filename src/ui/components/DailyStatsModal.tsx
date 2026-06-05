// Daily Grid stats popup. Opens from the rank panel's "Stats →"
// button. Shows median, win-rate (share of players who beat the
// target), and the top 10 leaderboard. The player's row is
// highlighted when they're in the top 10; if they're outside, a
// separate "your rank" row is appended at the bottom.
//
// Data is fetched lazily on open — keeps the result-screen-first
// paint cheap for players who never tap through.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DailyStatsSnapshot,
  fetchDailyStats,
  isBackendConfigured,
} from '../daily/supabase';
import { useDaily } from '../daily/DailyProvider';
import { useDailyRank } from '../hooks/useDailyRank';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  dateISO: string;
  onClose: () => void;
}

const formatDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${MONTHS[Number(mo) - 1] ?? mo} ${Number(d)}, ${y}`;
};

type FetchStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export const DailyStatsModal = ({ visible, dateISO, onClose }: Props) => {
  const { deviceId } = useDaily();
  // Player's own rank (so we can show the "you ranked Nth" row below
  // the top 10 when they're not in the leaderboard slice).
  const { rank: ownRank } = useDailyRank(dateISO);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [stats, setStats] = useState<DailyStatsSnapshot | null>(null);
  // Surface the actual error message so playtest issues (RPC missing
  // a grant, schema cache stale, parameter mismatch) don't hide
  // behind a generic "couldn't reach the server". Cleared when the
  // modal closes or a fresh fetch starts.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    // When the modal closes, leave status/stats/errorDetail in place
    // so the fade-out animation keeps rendering the last-shown body
    // — otherwise the sheet collapses to an empty box for a frame.
    // The next open immediately bumps status to 'loading', which
    // takes over rendering before any stale data shows through.
    if (!visible) return;
    if (!isBackendConfigured()) {
      setStatus('unavailable');
      return;
    }
    if (!deviceId) return;

    let cancelled = false;
    setStatus('loading');
    setErrorDetail(null);
    fetchDailyStats(deviceId, dateISO)
      .then(s => {
        if (cancelled) return;
        setStats(s);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Pull whatever signal we can off the error object — supabase-js
        // wraps Postgres errors with { message, code, details, hint }.
        const err = e as { message?: string; code?: string; hint?: string; details?: string };
        const parts = [
          err.code ? `[${err.code}]` : null,
          err.message ?? String(e),
          err.hint,
          err.details,
        ].filter((p): p is string => !!p);
        setErrorDetail(parts.join(' · '));
        setStatus('error');
        // Also log so DevTools picks it up for deeper inspection.
        console.error('[DailyStatsModal] fetchDailyStats failed', e);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, deviceId, dateISO]);

  const playerInTop10 = !!stats?.topScores.some(r => r.isOwn);
  const showOwnRow =
    status === 'ready' &&
    !playerInTop10 &&
    ownRank !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.kicker}>DAILY · {formatDate(dateISO)}</Text>
              <Text style={styles.title}>Leaderboard</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          {status === 'loading' && (
            <Text style={styles.statusLine}>Loading stats…</Text>
          )}
          {status === 'error' && (
            <>
              <Text style={styles.errorLine}>Couldn't reach the server.</Text>
              {errorDetail && (
                <Text style={styles.errorDetail} selectable>
                  {errorDetail}
                </Text>
              )}
            </>
          )}
          {status === 'unavailable' && (
            <Text style={styles.statusLine}>
              Leaderboard backend not configured for this build.
            </Text>
          )}

          {status === 'ready' && stats && (
            <>
              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>PLAYERS</Text>
                  <Text style={styles.statValue}>{stats.total}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>MEDIAN</Text>
                  <Text style={styles.statValue}>
                    {stats.median !== null ? Math.round(stats.median) : '—'}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>BEAT TARGET</Text>
                  <Text style={[styles.statValue, styles.statValueAccent]}>
                    {stats.winRatePct !== null ? `${stats.winRatePct}%` : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>
                TOP {Math.min(stats.topScores.length, 10)}
              </Text>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {stats.topScores.length === 0 ? (
                  <Text style={styles.emptyNote}>No scores submitted yet.</Text>
                ) : (
                  stats.topScores.map(row => (
                    <View
                      key={`${row.rank}-${row.displayName}`}
                      style={[styles.row, row.isOwn && styles.rowOwn]}
                    >
                      <Text style={[styles.rowRank, row.isOwn && styles.rowRankOwn]}>
                        #{row.rank}
                      </Text>
                      <Text
                        style={[styles.rowName, row.isOwn && styles.rowNameOwn]}
                        numberOfLines={1}
                      >
                        {row.displayName}
                      </Text>
                      <Text style={[styles.rowScore, row.isOwn && styles.rowScoreOwn]}>
                        {row.score}
                      </Text>
                    </View>
                  ))
                )}

                {showOwnRow && (
                  <>
                    <Text style={styles.gapNote}>…</Text>
                    <View style={[styles.row, styles.rowOwn]}>
                      <Text style={[styles.rowRank, styles.rowRankOwn]}>
                        #{ownRank!.rank}
                      </Text>
                      <Text style={[styles.rowName, styles.rowNameOwn]}>
                        You
                      </Text>
                      <Text style={[styles.rowScore, styles.rowScoreOwn]}>
                        {ownRank!.score}
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.accent, 18, 0.3),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  kicker: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.bgBase,
    borderColor: colors.outlineSoft,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  statValue: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statValueAccent: {
    color: colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outlineSoft,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    paddingBottom: spacing.sm,
  },
  emptyNote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  rowOwn: {
    backgroundColor: 'rgba(107, 214, 255, 0.12)',
    borderColor: colors.accent,
    borderWidth: 1,
    ...glow(colors.accent, 4, 0.3),
  },
  rowRank: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    width: 40,
  },
  rowRankOwn: {
    color: colors.accent,
  },
  rowName: {
    flex: 1,
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  rowNameOwn: {
    color: colors.accent,
    fontWeight: '800',
  },
  rowScore: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
  },
  rowScoreOwn: {
    color: colors.success,
  },
  gapNote: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: 4,
    textAlign: 'center',
    marginVertical: 4,
  },
  statusLine: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  errorLine: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    paddingTop: spacing.lg,
  },
  errorDetail: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
});
