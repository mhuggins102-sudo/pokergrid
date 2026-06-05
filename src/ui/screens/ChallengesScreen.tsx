import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHALLENGES, ChallengeId } from '../../game/challenges';
import { NeonButton } from '../components/NeonButton';
import { useStats } from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
  onStart: (id: ChallengeId) => void;
}

// At any time, the first two NOT-YET-BEATEN challenges in CHALLENGES
// order are unlocked; everything past them is locked until one of the
// unbeaten unlocked challenges is cleared. Beaten challenges remain
// playable. With N beaten in the top tier, the next N locked entries
// become available — so the "unlocked-but-unbeaten" count stays at 2.
const UNLOCKED_UNBEATEN_WINDOW = 2;

// Sequential-unlock toggle. When true, only the first two not-yet-beaten
// challenges are playable; beating one unlocks the next. Flip to false
// to bypass the gate (handy for playtesting the full set).
const UNLOCK_GATE_ENABLED = true;

const isChallengeUnlocked = (
  idx: number,
  doneIds: readonly string[]
): boolean => {
  if (!UNLOCK_GATE_ENABLED) return true;
  if (doneIds.includes(CHALLENGES[idx].id)) return true;
  let unbeatenBefore = 0;
  for (let i = 0; i < idx; i++) {
    if (!doneIds.includes(CHALLENGES[i].id)) unbeatenBefore += 1;
  }
  return unbeatenBefore < UNLOCKED_UNBEATEN_WINDOW;
};

export const ChallengesScreen = ({ onBack, onStart }: Props) => {
  const { stats } = useStats();
  // Currently-open info popup, keyed by challenge id. null = closed.
  const [infoId, setInfoId] = useState<ChallengeId | null>(null);
  // Only count IDs that still exist in CHALLENGES — stats.challengesDone
  // may carry migrated IDs from the pre-Achievements split, and we
  // don't want those inflating the tally.
  const doneCount = CHALLENGES.filter(c =>
    stats.challengesDone.includes(c.id)
  ).length;
  // The currently-selected info card. We also stash a sticky ref to
  // the LAST shown challenge so the modal's fade-out animation keeps
  // rendering the previous content instead of going blank for a
  // frame the moment infoId clears.
  const liveInfoChallenge = CHALLENGES.find(c => c.id === infoId) ?? null;
  const lastShownInfoRef = useRef<typeof liveInfoChallenge>(null);
  if (liveInfoChallenge) lastShownInfoRef.current = liveInfoChallenge;
  const renderedInfoChallenge = liveInfoChallenge ?? lastShownInfoRef.current;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Challenges</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.intro}>
        Each challenge runs on the Hard ruleset, with unique deck and
        rule twists. Beat its target score to mark as complete and
        unlock the next challenge in the list.
      </Text>

      <Text style={styles.tally}>
        {doneCount} / {CHALLENGES.length} cleared
      </Text>

      <View style={styles.list}>
        {CHALLENGES.map((c, idx) => {
          const done = stats.challengesDone.includes(c.id);
          const unlocked = isChallengeUnlocked(idx, stats.challengesDone);
          if (!unlocked) {
            return (
              <View key={c.id} style={[styles.card, styles.cardLocked]}>
                <View style={styles.cardTopRow}>
                  <Text style={[styles.cardTitle, styles.cardTitleLocked]}>
                    {c.name}
                  </Text>
                  <Text style={styles.cardLockIcon}>🔒</Text>
                </View>
                <Text style={[styles.cardTarget, styles.cardTargetLocked]}>
                  Target: {c.scoreTarget}
                </Text>
                <Text
                  style={[styles.cardSynopsis, styles.cardSynopsisLocked]}
                  numberOfLines={1}
                >
                  {c.synopsis}
                </Text>
                <Text style={[styles.cardCta, styles.cardCtaLocked]}>
                  Locked
                </Text>
              </View>
            );
          }
          return (
            <Pressable
              key={c.id}
              style={[styles.card, done && styles.cardDone]}
              onPress={() => onStart(c.id)}
            >
              <View style={styles.cardTopRow}>
                <Text
                  style={[styles.cardTitle, done && styles.cardTitleDone]}
                >
                  {c.name}
                </Text>
                {done && <Text style={styles.cardBadge}>· DONE</Text>}
                {/*
                  Info hit area lives in the right portion of the
                  card. Generous width (60px) + extra hitSlop so the
                  player doesn't have to land precisely on the icon
                  to open the popup. stopPropagation keeps the outer
                  Start press from also firing.
                */}
                <Pressable
                  onPress={e => {
                    e.stopPropagation();
                    setInfoId(c.id);
                  }}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  style={styles.cardInfoHit}
                  accessibilityLabel="More info"
                  accessibilityRole="button"
                >
                  <Text style={styles.cardInfoIcon}>ⓘ</Text>
                </Pressable>
              </View>
              <Text style={styles.cardTarget}>Target: {c.scoreTarget}</Text>
              <Text style={styles.cardSynopsis} numberOfLines={1}>
                {c.synopsis}
              </Text>
              <Text style={styles.cardCta}>
                {done ? 'Play again →' : 'Start →'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        More challenges coming. Suggestions welcome.
      </Text>

      <Modal
        visible={infoId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setInfoId(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {renderedInfoChallenge && (
              <>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>{renderedInfoChallenge.name}</Text>
                  <Pressable onPress={() => setInfoId(null)} hitSlop={12}>
                    <Text style={styles.modalCloseBtn}>×</Text>
                  </Pressable>
                </View>
                <Text style={styles.modalTarget}>
                  Target: {renderedInfoChallenge.scoreTarget}
                </Text>
                <Text style={styles.modalDesc}>{renderedInfoChallenge.goal}</Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  // Short paragraph under the title explaining the Hard ruleset +
  // sequential unlock rule. Same body styling as the Achievements
  // intro for consistency.
  intro: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  // Mirrors the Achievements tally — tinted with the "done" success
  // green so it reads as a progress marker, not a header.
  tally: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: colors.success,
    textShadowRadius: 2,
    marginBottom: spacing.md,
  },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...glow(colors.warn, 6, 0.25),
  },
  cardDone: {
    borderColor: colors.success,
    ...glow(colors.success, 8, 0.3),
  },
  // Locked tile — still readable (the player can see the goal), but
  // muted: no glow, gray outline, dimmer text. Not pressable: the
  // wrapper is a View, not a Pressable.
  cardLocked: {
    borderColor: colors.outline,
    opacity: 0.7,
    // Override the warn glow that the base .card style sets so the
    // locked tile doesn't pulse.
    shadowOpacity: 0,
    elevation: 0,
  },
  cardTitleLocked: {
    // Brighter than textLow so the title reads cleanly through the
    // 0.7 card opacity — full warn glow looks too lit-up for a
    // locked tile, but going all the way to gray-on-gray blurred the
    // title. textMid + no shadow is the sweet spot.
    color: colors.textMid,
    textShadowColor: 'transparent',
    textShadowRadius: 0,
  },
  cardCtaLocked: {
    color: colors.textLow,
    textShadowColor: 'transparent',
    textShadowRadius: 0,
  },
  cardLockIcon: {
    marginLeft: 'auto',
    color: colors.textLow,
    fontSize: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: colors.warn,
    textShadowRadius: 1,
  },
  cardTitleDone: {
    color: colors.success,
    textShadowColor: colors.success,
  },
  cardBadge: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginLeft: spacing.sm,
    textShadowColor: colors.success,
    textShadowRadius: 2,
  },
  // Generous tap target for the ⓘ icon — anchored to the right edge
  // of the top row so the player can land on the rightmost ~60px of
  // the card to open the info popup without hitting Start. No extra
  // vertical padding — the title's intrinsic height drives the row
  // height; the hitSlop above handles touch comfort.
  cardInfoHit: {
    marginLeft: 'auto',
    minWidth: 60,
    alignItems: 'flex-end',
  },
  cardInfoIcon: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    textShadowColor: colors.accent,
    textShadowRadius: 2,
  },
  // Target + synopsis share the original body-text styling. Both
  // sit in the same visual register as the old single-line goal
  // text so the card height stays close to the pre-redesign height.
  cardTarget: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  cardTargetLocked: {
    color: colors.textLow,
  },
  cardSynopsis: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  cardSynopsisLocked: {
    color: colors.textLow,
  },
  cardCta: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  footnote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  // ---- Info popup ----
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.warn, 18, 0.3),
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  modalCloseBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  modalTarget: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  modalDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
  },
});
