import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Difficulty, TARGET_BY_DIFFICULTY } from '../../game/rules';

interface Props {
  onStart: (difficulty: Difficulty) => void;
}

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Target 150' },
  { id: 'medium', label: 'Medium', blurb: 'Target 225' },
  { id: 'hard', label: 'Hard', blurb: 'Target 300' },
];

export const HomeScreen = ({ onStart }: Props) => {
  const [picked, setPicked] = useState<Difficulty>('medium');
  return (
    <View style={styles.root}>
      <Text style={styles.title}>PokerGrid</Text>
      <Text style={styles.subtitle}>5×5 poker solitaire</Text>

      <View style={styles.diffBlock}>
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <View style={styles.diffRow}>
          {DIFFICULTIES.map(d => (
            <Pressable
              key={d.id}
              onPress={() => setPicked(d.id)}
              style={[styles.diffBtn, picked === d.id && styles.diffPicked]}
            >
              <Text style={[styles.diffLabel, picked === d.id && styles.diffPickedText]}>
                {d.label}
              </Text>
              <Text style={[styles.diffBlurb, picked === d.id && styles.diffPickedText]}>
                {d.blurb}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={styles.startBtn} onPress={() => onStart(picked)}>
        <Text style={styles.startText}>Start (target {TARGET_BY_DIFFICULTY[picked]})</Text>
      </Pressable>

      <View style={styles.rulesBlock}>
        <Text style={styles.rulesTitle}>How it works</Text>
        <Text style={styles.rulesText}>
          Draw a card. Place it in the lowest-numbered empty slot, or discard it for a suit-themed
          action. ♥ swap two same-suit cards. ♠ slide a card forward. ♣ boost a hand type's payout.
          ♦ reshuffle the discard and re-draw. The joker is always placed and acts as a wild in
          whichever row/column it sits in. Each row and column scores a poker hand at the end —
          beat your target.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#1d2331' },
  title: { color: '#f4f5f9', fontSize: 42, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#9aa0b2', marginTop: 6, fontSize: 14, marginBottom: 24 },
  sectionLabel: { color: '#9aa0b2', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
  diffBlock: { width: '100%', alignItems: 'center', marginBottom: 18 },
  diffRow: { flexDirection: 'row', gap: 10 },
  diffBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderColor: '#3c4456',
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 88,
  },
  diffPicked: { backgroundColor: '#3680ff', borderColor: '#3680ff' },
  diffLabel: { color: '#cfd2dd', fontWeight: '700', fontSize: 16 },
  diffBlurb: { color: '#9aa0b2', fontSize: 11, marginTop: 2 },
  diffPickedText: { color: '#ffffff' },
  startBtn: {
    marginTop: 16,
    backgroundColor: '#7cdca0',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  startText: { color: '#0e1a18', fontSize: 16, fontWeight: '800' },
  rulesBlock: { marginTop: 32, maxWidth: 360 },
  rulesTitle: { color: '#cfd2dd', fontWeight: '700', marginBottom: 6, fontSize: 13 },
  rulesText: { color: '#9aa0b2', fontSize: 12, lineHeight: 18 },
});
